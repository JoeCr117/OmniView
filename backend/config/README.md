# backend/config/

## Purpose
The Django *project* (not an app): settings, URL roots, the single NinjaAPI
instance, the multi-schema DB router, request middleware, and the Lakebase
Postgres engine. It wires the shell and the apps together but contains no
dashboard logic of its own.

## Role in OmniView
Everything boots from here. `api.py` mounts each registered app's router under
`/api/<id>/`; `db_router.py` sends unmanaged models to the `datavault` schema
and keeps migrations off it; `frontend.py` serves the static export and owns
redirects + page-level auth gating (the export can't). It reads the registry
but never names an app.

## Contents
| Item | What it does |
|------|--------------|
| `settings/` | Per-environment settings (`base`, `local`, `databricks`, `e2e`, `test`). |
| `pg_lakebase/` | A Postgres engine subclass that mints Lakebase OAuth tokens as the DB password. |
| `tests/` | Project-wide tests: schema contract, API prefixes, auth enforcement, the frontend view, README coverage. |
| `api.py` | Builds the `NinjaAPI`, mounts registered routers + per-app error handlers. |
| `db_router.py` | Routes by the model's `managed` flag; `allow_migrate` = never on datavault. |
| `frontend.py` | Serves `frontend/out`, does legacy 301s, 404s admin pages for non-staff. |
| `middleware.py` | Request-ID + duration logging (`omniview.request`). |
| `urls.py` · `asgi.py` · `wsgi.py` | URL roots and the ASGI/WSGI entry points. |

## Conventions & gotchas
- **Two DB aliases, one database**, differing only by `search_path`: `default`
  → schema `omniview`, `datavault` → schema `datavault`.
- Router-level auth on a mounted app router overrides the API default — that is
  how deny-by-default app access is enforced.
- You do **not** edit `api.py`/`db_router.py`/`frontend.py` to add an app; the
  registry drives them. If you're editing here to add an app, extend `appspec.py`.

## See also
- [backend/](../README.md) · [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- [settings/](settings/README.md) · [pg_lakebase/](pg_lakebase/README.md) · [tests/](tests/README.md)
