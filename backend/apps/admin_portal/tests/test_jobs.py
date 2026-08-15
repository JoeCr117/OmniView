"""
Jobs overview: SDK result shaping, the OBO client fallback chain, the error
taxonomy (503 not_connected / 403 missing_scope), and the per-user cache.
The WorkspaceClient is always mocked - no network.
"""

from types import SimpleNamespace
from unittest import mock

import pytest
from django.contrib.auth.models import User
from django.core.cache import cache

from apps.admin_portal import databricks as dbx
from apps.admin_portal import services

pytestmark = pytest.mark.django_db

URL = '/api/admin-portal/jobs/overview'


def _enum(value):
    return SimpleNamespace(value=value)


def _run(run_id, job_id, life, result, start=1_700_000_000_000, end=1_700_000_060_000):
    return SimpleNamespace(
        run_id=run_id,
        job_id=job_id,
        run_name=f'run-{run_id}',
        state=SimpleNamespace(
            life_cycle_state=_enum(life),
            result_state=_enum(result) if result else None,
        ),
        start_time=start,
        end_time=end,
        run_page_url=f'https://workspace/jobs/{job_id}/runs/{run_id}',
    )


def _fake_client():
    jobs_api = SimpleNamespace(
        list=lambda limit: iter(
            [
                SimpleNamespace(job_id=10, settings=SimpleNamespace(name='Nightly rebuild')),
            ]
        ),
        list_runs=lambda active_only=False, completed_only=False, limit=25: iter(
            [_run(1, 10, 'RUNNING', None, end=None)]
            if active_only
            else [
                _run(2, 10, 'TERMINATED', 'SUCCESS'),
                _run(3, 10, 'TERMINATED', 'FAILED'),
            ]
        ),
    )
    return SimpleNamespace(jobs=jobs_api)


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


class TestShaping:
    def test_overview_shapes_and_splits_runs(self):
        data = services.jobs_overview(_fake_client())
        assert data['counts'] == {'jobs': 1, 'running': 1, 'completed': 1, 'failed': 1}
        assert data['running'][0]['job_name'] == 'Nightly rebuild'
        assert data['running'][0]['duration_ms'] is None
        assert data['completed'][0]['result_state'] == 'SUCCESS'
        failed = data['failed'][0]
        assert failed['result_state'] == 'FAILED'
        assert failed['duration_ms'] == 60_000
        assert failed['run_page_url'] == 'https://workspace/jobs/10/runs/3'
        assert data['completed'][0]['start_time'].year == 2023


class TestEndpoint:
    def test_endpoint_returns_overview(self, client, monkeypatch):
        monkeypatch.setattr(services, 'obo_client', lambda request: _fake_client())
        response = client.get(URL)
        assert response.status_code == 200
        assert response.json()['counts']['jobs'] == 1

    def test_not_connected_503s_with_code(self, client, monkeypatch):
        def boom(request):
            raise dbx.DatabricksNotConnected('no credentials')

        monkeypatch.setattr(services, 'obo_client', boom)
        response = client.get(URL)
        assert response.status_code == 503
        assert response.json()['code'] == 'not_connected'

    def test_denied_obo_falls_back_to_app_identity(self, client, monkeypatch):
        # The workspace can't grant a jobs user-scope, so a denied user token
        # must retry as the app's own identity instead of dead-ending.
        from databricks.sdk import errors

        failing = _fake_client()

        def denied(**kwargs):
            raise errors.PermissionDenied('nope')

        failing.jobs.list = lambda limit: denied()

        monkeypatch.setattr(services, 'obo_client', lambda request: failing)
        monkeypatch.setattr(services, 'fallback_client', lambda: _fake_client())
        response = client.get(URL)
        assert response.status_code == 200
        assert response.json()['counts']['jobs'] == 1

    def test_403s_when_both_identities_are_denied(self, client, monkeypatch):
        from databricks.sdk import errors

        def make_failing():
            failing = _fake_client()

            def denied(**kwargs):
                raise errors.PermissionDenied('nope')

            failing.jobs.list = lambda limit: denied()
            return failing

        monkeypatch.setattr(services, 'obo_client', lambda request: make_failing())
        monkeypatch.setattr(services, 'fallback_client', make_failing)
        response = client.get(URL)
        assert response.status_code == 403
        assert response.json()['code'] == 'missing_scope'

    def test_cache_hit_skips_the_sdk(self, client, monkeypatch):
        calls = {'n': 0}

        def counting_client(request):
            calls['n'] += 1
            return _fake_client()

        monkeypatch.setattr(services, 'obo_client', counting_client)
        user = User.objects.create_user(username='boss', password='x', is_staff=True)
        client.force_login(user)
        assert client.get(URL).status_code == 200
        assert client.get(URL).status_code == 200
        assert calls['n'] == 1


class TestOboClient:
    def test_prefers_forwarded_token(self, rf, monkeypatch):
        monkeypatch.setenv('DATABRICKS_HOST', 'https://workspace.example.com')
        request = rf.get('/', HTTP_X_FORWARDED_ACCESS_TOKEN='user-token')
        with mock.patch('databricks.sdk.WorkspaceClient') as client_cls:
            dbx.obo_client(request)
        client_cls.assert_called_once_with(
            host='https://workspace.example.com', token='user-token', auth_type='pat'
        )

    def test_falls_back_to_env_auth_without_header(self, rf):
        request = rf.get('/')
        with mock.patch('databricks.sdk.WorkspaceClient') as client_cls:
            dbx.obo_client(request)
        client_cls.assert_called_once_with()

    def test_raises_not_connected_when_nothing_configures(self, rf):
        request = rf.get('/')
        with mock.patch('databricks.sdk.WorkspaceClient', side_effect=ValueError('no auth')):
            with pytest.raises(dbx.DatabricksNotConnected):
                dbx.obo_client(request)
