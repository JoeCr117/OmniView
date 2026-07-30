"""
Make the Lakebase database ready for the app's service principal - the one deploy
step that used to need a human at a psql prompt.

    uv run python deploy/databricks/provision_db.py            # provision + verify
    uv run python deploy/databricks/provision_db.py --verify   # verify only, no changes

WHY THIS EXISTS
---------------
Every `databricks apps create` mints a brand-new service principal with **zero**
Postgres privileges. Until that SP is a member of the shared owner role it cannot
even run `migrate` (it dies with `permission denied for schema public`), so a
from-scratch or post-teardown redeploy is dead on arrival without one GRANT.

The dbt `on-run-end` hook (macros/ensure_schema_ownership.sql) and
`manage.py ensure_ownership` fix *object* ownership, but they **presuppose** this
membership - they run as the SP and reassign what it owns; nothing in them can add
the SP to a role. Adding a member has to be done by the workspace user (the only
identity that is an admin of the owner role), from a live Postgres session. That
session is the manual step this script removes.

It mints a short-lived Lakebase OAuth token **as the workspace user** - the same
mechanism the app uses at runtime (backend/config/pg_lakebase/credentials.py), but
under your CLI identity rather than the app SP - connects, and idempotently:

  1. ensures the shared owner role exists (a fresh Lakebase has none),
  2. makes the workspace user a member and the app SP a member,
  3. grants the role CREATE/CONNECT on the database,
  4. hands any *existing* schema to the role (best-effort),

then verifies the SP is a member and prints the object-ownership tripwire for both
schemas. Everything is read from deploy/databricks/databricks_manifest.json and the
live app, and every statement is idempotent - safe to run from **any** state
(fresh create, undelete, or a re-run) and as often as you like.

Assumes the Lakebase project already exists (undeleted or created); that is the CLI
step the deploy runs first. See docs/DEPLOYMENT.md and the build-omniview skill.
"""

import argparse
import json
import sys
from pathlib import Path

import psycopg
from psycopg import sql

MANIFEST = Path(__file__).resolve().parent / 'databricks_manifest.json'
EXAMPLE_MANIFEST = MANIFEST.with_name('databricks_manifest.example.json')
#: The schemas the app owns. Matches ensure_schemas / the dbt target schema.
SCHEMAS = ('omniview', 'datavault')
#: Must match the dbt macro's default and manage.py ensure_ownership's OWNER_ROLE.
OWNER_ROLE = 'omniview_owner'


def load_config() -> dict:
    if not MANIFEST.exists():
        # The manifest is git-ignored deployment state, so a fresh clone has none.
        sys.exit(
            f'ABORTED: no manifest at {MANIFEST}.\n'
            'It is git-ignored (deployment state, not source). Copy '
            f'{EXAMPLE_MANIFEST.name} to {MANIFEST.name} and fill in your '
            "workspace's values - this script needs lakebase_host, "
            'lakebase_database, lakebase_endpoint, cli_profile and app_name.'
        )
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    info = manifest['info']
    return {
        'profile': manifest['cli_profile'],
        'app_name': manifest['app_name'],
        'host': info['lakebase_host'],
        'database': info['lakebase_database'],
        'endpoint': info['lakebase_endpoint'],
    }


def connect(cfg: dict) -> tuple[psycopg.Connection, str, str]:
    """Open a Lakebase connection as the workspace user, and return it alongside
    that user's name and the app SP's client id."""
    from databricks.sdk import WorkspaceClient

    w = WorkspaceClient(profile=cfg['profile'])
    workspace_user = w.current_user.me().user_name
    sp_client_id = w.apps.get(cfg['app_name']).service_principal_client_id
    if not sp_client_id:
        raise RuntimeError(
            f"app {cfg['app_name']!r} has no service_principal_client_id yet - "
            'has `apps create` finished?'
        )
    # Same call the app makes for its own password, under our identity.
    token = w.postgres.generate_database_credential(endpoint=cfg['endpoint']).token
    conn = psycopg.connect(
        host=cfg['host'],
        dbname=cfg['database'],
        user=workspace_user,
        password=token,
        sslmode='require',
        autocommit=True,  # each grant is its own txn, so a best-effort step can fail cleanly
    )
    return conn, workspace_user, sp_client_id


def provision(conn: psycopg.Connection, cfg: dict, workspace_user: str, sp_client_id: str) -> None:
    role = sql.Identifier(OWNER_ROLE)

    with conn.cursor() as cur:
        # 1. Ensure the shared owner role exists. On a fresh Lakebase there is
        #    none; the creator (this workspace user) keeps implicit ADMIN on it,
        #    which is what lets step 3 add the SP.
        cur.execute('select 1 from pg_roles where rolname = %s', (OWNER_ROLE,))
        if cur.fetchone() is None:
            cur.execute(sql.SQL('create role {role} nologin').format(role=role))
            print(f'  role      {OWNER_ROLE}: created')
        else:
            print(f'  role      {OWNER_ROLE}: already exists')

        # 2. The workspace user is a member too (so it may reassign schemas in
        #    step 4). Idempotent, and re-granting SET/INHERIT does not drop the
        #    ADMIN it already holds.
        cur.execute(
            sql.SQL('grant {role} to {user} with set true, inherit true').format(
                role=role, user=sql.Identifier(workspace_user)
            )
        )
        # 3. The grant that was the manual step: the app SP becomes a member and
        #    inherits the role's rights, so migrate and rebuilds work.
        cur.execute(
            sql.SQL('grant {role} to {sp} with set true, inherit true').format(
                role=role, sp=sql.Identifier(sp_client_id)
            )
        )
        # 4. Let the role create and connect (needed on a fresh database).
        cur.execute(
            sql.SQL('grant create, connect on database {db} to {role}').format(
                db=sql.Identifier(cfg['database']), role=role
            )
        )
    print(f'  member    {workspace_user}, {sp_client_id} (app SP)')
    print(f"  database  {cfg['database']}: CREATE, CONNECT -> {OWNER_ROLE}")

    # 5. Hand any existing schema to the role, best-effort and per-schema. On a
    #    fresh create the schemas do not exist yet (the app makes them on first
    #    start); a schema stranded under a dead SP cannot be reassigned by anyone
    #    but its owner. Neither case is fatal to the grants above - the app's
    #    ensure_ownership settles object ownership as the SP on start.
    for schema in SCHEMAS:
        with conn.cursor() as cur:
            cur.execute('select 1 from pg_namespace where nspname = %s', (schema,))
            if cur.fetchone() is None:
                print(f'  schema    {schema}: absent (created on first app start) - skipped')
                continue
            try:
                cur.execute(
                    sql.SQL('alter schema {schema} owner to {role}').format(
                        schema=sql.Identifier(schema), role=role
                    )
                )
                print(f'  schema    {schema}: owner -> {OWNER_ROLE}')
            except psycopg.Error as exc:
                print(
                    f'  schema    {schema}: left as-is ({str(exc).strip()}); '
                    "the app's ensure_ownership handles this on start"
                )


def verify(conn: psycopg.Connection, sp_client_id: str) -> bool:
    with conn.cursor() as cur:
        cur.execute('select pg_has_role(%s, %s, %s)', (sp_client_id, OWNER_ROLE, 'MEMBER'))
        is_member = cur.fetchone()[0]
        print(f"\n  VERIFY  app SP is a member of {OWNER_ROLE}: {'yes' if is_member else 'NO'}")

        # The ownership tripwire, per schema: anything other than the owner role
        # is a finding that would surface as `permission denied` on a page load.
        for schema in SCHEMAS:
            cur.execute(
                'select pg_get_userbyid(c.relowner) as owner, count(*) '
                'from pg_class c join pg_namespace n on n.oid = c.relnamespace '
                "where n.nspname = %s and c.relkind in ('r','p','v','m') group by 1 order by 1",
                (schema,),
            )
            rows = cur.fetchall()
            if not rows:
                print(f'  VERIFY  {schema}: no relations yet')
                continue
            summary = ', '.join(f'{owner}={count}' for owner, count in rows)
            clean = len(rows) == 1 and rows[0][0] == OWNER_ROLE
            flag = '' if clean else f'  <-- FINDING: not all owned by {OWNER_ROLE}'
            print(f'  VERIFY  {schema} object owners: {summary}{flag}')
    return bool(is_member)


def main() -> None:
    parser = argparse.ArgumentParser(description='Provision Lakebase grants for the app SP.')
    parser.add_argument('--verify', action='store_true', help='verify only; make no changes')
    args = parser.parse_args()

    cfg = load_config()
    print(f"Lakebase {cfg['host']} / {cfg['database']} (profile {cfg['profile']})")
    try:
        conn, workspace_user, sp_client_id = connect(cfg)
    except Exception as exc:  # noqa: BLE001 - any auth/connect failure should print plainly and abort
        sys.exit(f'ABORTED: could not connect to Lakebase as the workspace user: {exc}')

    with conn:
        if not args.verify:
            print(f'Provisioning for app SP {sp_client_id}:')
            provision(conn, cfg, workspace_user, sp_client_id)
        is_member = verify(conn, sp_client_id)

    if not is_member:
        sys.exit(f'\nABORTED: the app service principal is still not a member of {OWNER_ROLE}.')
    print('\nOK - the app service principal can run migrate and rebuilds.')


if __name__ == '__main__':
    main()
