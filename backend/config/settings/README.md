# backend/config/settings/

## Purpose
The per-environment Django settings modules. A shared `base.py` holds everything
common (installed apps from the registry, logging, auth flags, the `pg_database`
helper); each other module layers one deployment target on top.

## Role in OmniView
`DJANGO_SETTINGS_MODULE` selects which one loads. `base.py` reads the app
registry to build `INSTALLED_APPS`, so a registered app is installed without
touching this folder. Connection config is libpq-standard `PG*` env vars
everywhere.

## Contents
| Item | What it does |
|------|--------------|
| `base.py` | Shared settings: registry-driven `INSTALLED_APPS`, `pg_database()`, logging, `OMNIVIEW_*` flags, admin bootstrap. |
| `local.py` | Local dev / Docker compose: Postgres on the compose `db` service. |
| `databricks.py` | The Databricks App: Lakebase engine, header auth, secure cookies, `sso_managed`. |
| `e2e.py` | Playwright tier: the dedicated `omniview_e2e` database, pinned flags, `IS_E2E`. |
| `test.py` | pytest tier: in-memory SQLite, sentinel data paths (fast, off Postgres). |

## Conventions & gotchas
- `PIPELINE_ROOT` points at a package-less scratch dir under `test`/`e2e` so a
  stray UI rebuild fails fast instead of touching a real database.
- `databricks.py` is the only place header auth (`ForwardedEmailMiddleware`) is
  wired — loading it without the Databricks proxy in front would be an auth bypass.
- `test.py` staying SQLite is deliberate (speed); the E2E tier is where Postgres
  behavior is exercised.

## See also
- [config/](../README.md) · [pg_lakebase/](../pg_lakebase/README.md)
- `docs/DEPLOYMENT.md` (every env var and the Databricks runbook)
