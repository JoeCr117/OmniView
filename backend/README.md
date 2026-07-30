# backend/

## Purpose
The OmniView web layer: a Django + django-ninja server that serves the Next.js
static export and owns every `/api/*` route, authentication, and the ORM over
both Postgres schemas. It runs the ETL as a subprocess but never imports it.

## Role in OmniView
This is one of the three top-level layers (`frontend/`, `backend/`,
`pipelines/`). The frontend talks to it over `/api/*`; the pipeline reads the
tables this layer owns with raw SQL. It is split three ways: `config/` (the
Django project), `shell/` (OmniView itself — auth, security, the app registry),
and `apps/<app>/` (one self-contained package per dashboard app).

## Contents
| Item | What it does |
|------|--------------|
| `config/` | The Django project: settings, URLs, the NinjaAPI, the DB router, middleware, the Lakebase engine. |
| `shell/` | OmniView itself — everything true of *every* app (auth, logging, the pipeline runner, the registry). |
| `apps/` | One package per dashboard app (`expense_tracker`, `admin_portal`). |
| `templates/` | Django template overrides (the django-ninja docs page). |
| `conftest.py` | Root pytest fixtures shared across the backend suite. |
| `manage.py` | Django's management entry point. |

## Conventions & gotchas
- Runs under `config.settings.test` for pytest (in-memory SQLite, sentinel
  paths) — the fast unit tier deliberately stays off Postgres.
- **Never rename a Django app label** — labels derive table names, two of which
  hold production data and are named literally in the pipeline's SQL.
  `config/tests/test_schema_contract.py` is the tripwire.
- The web layer and the pipeline never import each other (see `shell/pipeline.py`).
- Container startup (schemas → migrate → gunicorn) is **not** here: it lives in
  [docker/entrypoint.sh](../docker/README.md), with the Databricks equivalent at
  `deploy/databricks/databricks_start.py`.

## See also
- [Repo root](../README.md) · [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) (the structure contract)
- [config/](config/README.md) · [shell/](shell/README.md) · [apps/](apps/README.md)
