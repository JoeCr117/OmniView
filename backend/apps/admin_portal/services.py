"""
Admin Portal business logic: user listing, app-access/admin management, and
Databricks monitoring (jobs, costs, overview). All callers are behind
shell.security.AdminAuth (staff only) - these functions do not re-check the
caller's privileges, except the self-demotion guard.
"""

import time
from datetime import datetime, timezone
from itertools import islice
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Q
from ninja.errors import HttpError

from .databricks import (
    DatabricksForbidden,
    DatabricksNotConnected,
    fallback_client,
    obo_client,
    translate_errors,
)
from .models import GRANTABLE_APP_IDS, AppAccess

User = get_user_model()

SQL_DIR = Path(__file__).resolve().parent / 'sql'

# AppKit-style short-TTL caching, keyed per user: monitoring data is fetched
# on-behalf-of the caller, so entries must never be shared across users.
JOBS_CACHE_TTL_SECONDS = 30
JOBS_LIST_LIMIT = 25
COSTS_CACHE_TTL_SECONDS = 300
COSTS_DAYS_CHOICES = (7, 30, 90)
# Warehouse cold starts can exceed the API's max inline wait (50s); poll
# afterwards up to this budget.
STATEMENT_POLL_BUDGET_SECONDS = 120


def users_queryset(q: str | None = None):
    queryset = User.objects.prefetch_related('app_access').order_by('username')
    if q:
        queryset = queryset.filter(Q(username__icontains=q) | Q(email__icontains=q))
    return queryset


def _get_user(user_id: int):
    try:
        return User.objects.prefetch_related('app_access').get(pk=user_id)
    except User.DoesNotExist as exc:
        raise HttpError(404, f'Unknown user id {user_id}') from exc


def _require_grantable(app_id: str) -> None:
    if app_id not in GRANTABLE_APP_IDS:
        raise HttpError(
            422,
            f"'{app_id}' is not a grantable app (known: {', '.join(sorted(GRANTABLE_APP_IDS))})",
        )


def grant_app(user_id: int, app_id: str, granted_by) -> None:
    _require_grantable(app_id)
    user = _get_user(user_id)
    AppAccess.objects.get_or_create(
        user=user, app_id=app_id, defaults={'granted_by': granted_by}
    )


def revoke_app(user_id: int, app_id: str) -> None:
    _require_grantable(app_id)
    user = _get_user(user_id)
    AppAccess.objects.filter(user=user, app_id=app_id).delete()


def set_admin(user_id: int, is_staff: bool, acting_user):
    user = _get_user(user_id)
    if user.pk == acting_user.pk and not is_staff:
        # Lockout protection: the last admin can't accidentally demote
        # themselves out of the portal.
        raise HttpError(422, 'You cannot demote yourself.')
    if user.is_staff != is_staff:
        user.is_staff = is_staff
        user.save(update_fields=['is_staff'])
    return user


# --- Databricks jobs monitoring ---------------------------------------------

def _run_row(run, job_names: dict) -> dict:
    state = run.state
    life_cycle = getattr(state.life_cycle_state, 'value', None) if state else None
    result = getattr(state.result_state, 'value', None) if state and state.result_state else None
    duration_ms = None
    if run.start_time and run.end_time:
        duration_ms = run.end_time - run.start_time
    return {
        'run_id': run.run_id,
        'job_id': run.job_id,
        'job_name': job_names.get(run.job_id) or run.run_name or f'Job {run.job_id}',
        'life_cycle_state': life_cycle or 'UNKNOWN',
        'result_state': result,
        'start_time': (
            datetime.fromtimestamp(run.start_time / 1000, tz=timezone.utc)
            if run.start_time
            else None
        ),
        'duration_ms': duration_ms,
        'run_page_url': run.run_page_url,
    }


def jobs_overview(client) -> dict:
    """Running / completed / failed run lists with workspace deep links."""
    jobs = list(islice(client.jobs.list(limit=JOBS_LIST_LIMIT), 100))
    job_names = {
        job.job_id: (job.settings.name if job.settings else None) for job in jobs
    }
    running = [
        _run_row(run, job_names)
        for run in islice(client.jobs.list_runs(active_only=True, limit=JOBS_LIST_LIMIT), 25)
    ]
    finished = [
        _run_row(run, job_names)
        for run in islice(client.jobs.list_runs(completed_only=True, limit=JOBS_LIST_LIMIT), 50)
    ]
    completed = [run for run in finished if run['result_state'] == 'SUCCESS']
    failed = [run for run in finished if run['result_state'] != 'SUCCESS']
    return {
        'counts': {
            'jobs': len(jobs),
            'running': len(running),
            'completed': len(completed),
            'failed': len(failed),
        },
        'running': running,
        'completed': completed,
        'failed': failed,
    }


def jobs_overview_for(request) -> dict:
    """Cache wrapper: per-user key (OBO data), short TTL, client built only
    on a miss so cache hits never touch the SDK.

    OBO first; if the forwarded user token is denied (this workspace's
    user_api_scopes validator currently rejects every jobs scope spelling,
    so the token can never carry one), retry once as the app's own identity
    rather than dead-ending - self-heals when the platform adds the scope."""
    key = f'adminportal:jobs:{getattr(request.user, "pk", None) or "anon"}'
    cached = cache.get(key)
    if cached is not None:
        return cached
    try:
        with translate_errors():
            data = jobs_overview(obo_client(request))
    except DatabricksForbidden:
        with translate_errors():
            data = jobs_overview(fallback_client())
    cache.set(key, data, JOBS_CACHE_TTL_SECONDS)
    return data


# --- Databricks cost monitoring ----------------------------------------------

def run_warehouse_sql(client, sql_name: str, params: dict) -> list[dict]:
    """Execute apps/admin_portal/sql/<sql_name>.sql on the configured warehouse via
    the SQL Statement Execution API; returns rows as dicts of strings."""
    warehouse_id = settings.OMNIVIEW_SQL_WAREHOUSE_ID
    if not warehouse_id:
        raise DatabricksNotConnected(
            'No SQL warehouse configured (OMNIVIEW_SQL_WAREHOUSE_ID) - cost '
            'data is unavailable.'
        )
    from databricks.sdk.service.sql import StatementParameterListItem

    statement = (SQL_DIR / f'{sql_name}.sql').read_text(encoding='utf-8')
    parameters = [
        StatementParameterListItem(name=name, value=str(value), type='INT')
        for name, value in params.items()
    ]
    with translate_errors():
        response = client.statement_execution.execute_statement(
            warehouse_id=warehouse_id,
            statement=statement,
            parameters=parameters,
            wait_timeout='50s',
        )
        deadline = time.monotonic() + STATEMENT_POLL_BUDGET_SECONDS
        while response.status.state.value in ('PENDING', 'RUNNING'):
            if time.monotonic() > deadline:
                raise DatabricksNotConnected(
                    'The SQL warehouse did not return in time (cold start?) - retry shortly.'
                )
            time.sleep(3)
            response = client.statement_execution.get_statement(response.statement_id)

    state = response.status.state.value
    if state != 'SUCCEEDED':
        error = getattr(response.status, 'error', None)
        raise DatabricksNotConnected(f'SQL statement {state}: {getattr(error, "message", error)}')
    columns = [col.name for col in response.manifest.schema.columns]
    return [dict(zip(columns, row)) for row in (response.result.data_array or [])]


def costs_overview(client, days: int) -> dict:
    rows = [
        {
            'date': row['usage_date'],
            'sku': row['sku_name'],
            'dbus': float(row['dbus'] or 0),
            'list_cost_usd': float(row['list_cost_usd'] or 0),
        }
        for row in run_warehouse_sql(client, 'dbu_usage', {'days': days})
    ]

    daily: dict[str, dict] = {}
    by_sku: dict[str, dict] = {}
    for row in rows:
        day = daily.setdefault(row['date'], {'date': row['date'], 'dbus': 0.0, 'list_cost_usd': 0.0})
        day['dbus'] += row['dbus']
        day['list_cost_usd'] += row['list_cost_usd']
        sku = by_sku.setdefault(row['sku'], {'sku': row['sku'], 'dbus': 0.0, 'list_cost_usd': 0.0})
        sku['dbus'] += row['dbus']
        sku['list_cost_usd'] += row['list_cost_usd']

    sku_rows = sorted(by_sku.values(), key=lambda entry: entry['dbus'], reverse=True)
    return {
        'kpis': {
            'days': days,
            'total_dbus': sum(row['dbus'] for row in rows),
            'list_cost_usd': sum(row['list_cost_usd'] for row in rows),
            'top_sku': sku_rows[0]['sku'] if sku_rows else None,
        },
        'daily': sorted(daily.values(), key=lambda entry: entry['date']),
        'by_sku': sku_rows,
    }


def costs_overview_for(request, days: int) -> dict:
    if days not in COSTS_DAYS_CHOICES:
        raise HttpError(422, f'days must be one of {COSTS_DAYS_CHOICES}')
    key = f'adminportal:costs:{getattr(request.user, "pk", None) or "anon"}:{days}'
    cached = cache.get(key)
    if cached is not None:
        return cached
    data = costs_overview(obo_client(request), days)
    cache.set(key, data, COSTS_CACHE_TTL_SECONDS)
    return data


# --- Cross-area overview ------------------------------------------------------

def portal_overview(request) -> dict:
    """Landing-tab KPIs. DB-backed numbers always work; Databricks-backed
    numbers degrade to None + connected=False instead of erroring (this is
    the one monitoring endpoint that must return 200 without Databricks)."""
    data = {
        'users': {
            'total': User.objects.count(),
            'admins': User.objects.filter(is_staff=True).count(),
        },
        'connected': True,
        'jobs': None,
        'dbus_30d': None,
    }
    try:
        jobs = jobs_overview_for(request)
        data['jobs'] = {'running': jobs['counts']['running'], 'failed': jobs['counts']['failed']}
    except (DatabricksNotConnected, DatabricksForbidden):
        data['connected'] = False
    try:
        data['dbus_30d'] = costs_overview_for(request, 30)['kpis']['total_dbus']
    except (DatabricksNotConnected, DatabricksForbidden):
        data['connected'] = False
    return data
