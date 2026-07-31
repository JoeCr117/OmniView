# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

**OmniView** is a multi-app dashboard host: a Next.js shell + Django/Ninja backend that serves any
number of self-contained dashboard apps. One Docker container serves everything — Django (gunicorn,
port 8000) serves the Next.js **static export** from `frontend/out/` plus all `/api/*` routes
same-origin.

Apps are modular and independent. They share the shell — auth, access control, logging, chrome — and
nothing else. No app is load-bearing for another or for OmniView itself: apps never import each
other, and the shell reaches an app only through its declaration.

| App | What it is | Backend | Frontend | Pipeline |
|-----|-----------|---------|----------|----------|
| ExpenseTracker | Bank CSVs → categorized budgets and balances | `backend/apps/expense_tracker/` | `frontend/src/apps/expense-tracker/` | `pipelines/expense_tracker/` |
| Omni-ERD | Read-only ERDs over live database catalogs | `backend/apps/omni_erd/` | `frontend/src/apps/omni-erd/` | — |
| Admin Portal | Users, app access, Databricks costs/jobs, OpenAPI reference | `backend/apps/admin_portal/` | `frontend/src/apps/admin-portal/` | — |

**An app's internals are documented in its own package, not here.** Each package carries a
`README.md` plus a one-line `CLAUDE.md` importing it, so an app's specifics load when you work in
that app and cost nothing when you don't. This file is the *host* contract; the app's README is how
that app works.

## Deployment shape

A deployment = **one Postgres database, two schemas**:
- `omniview` — Django auth/sessions/admin, plus the managed source data apps own (ExpenseTracker's
  raw CSV text in `rawdata_rawfile` and budget-map YAML in `budgets_budgetmapdocument`, Omni-ERD's
  saved layouts in `omnierd_erdlayout`). Survives pipeline rebuilds.
- `datavault` — staged `stg_*` tables + everything dbt builds. Dropped and recreated per rebuild.

Locally that database is the docker-compose `db` service (postgres:17); in the cloud it is Databricks
Lakebase, with the app running as a Databricks App (docs/DEPLOYMENT.md "Databricks Apps + Lakebase";
every created workspace resource is listed in `deploy/databricks/databricks_manifest.json` and torn
down only via `deploy/databricks/tear_down.py`). Connection config is libpq-standard `PG*` env vars
everywhere, defaulting to the compose service.

## Data handling rules

**`Data/` is production data** — the original bank CSVs and BudgetMap, kept as the one-time import
source / backup (the app reads only the DB copies). It is **entirely git-ignored and must stay that
way**: the budget map's category tree names a real person's employer, landlord, insurers and medical
providers. Tests must never read or write it — the unit tier uses in-memory DBs + fixtures, the E2E
tier a dedicated `omniview_e2e` database. `docs/examples/Banks/` is the synthetic public stand-in.

**This repo is public.** Three files are deliberately git-ignored deployment state rather than
source, each with a tracked `*.example.*` template beside it:
`deploy/databricks/databricks_manifest.json`, `deploy/databricks/app.yaml`, and `docker/.env`.
Never commit real hostnames, service-principal ids, workspace paths or email addresses into tracked
files — use placeholders like `<your-workspace-user>`.

## Repo layout

```
backend/          the web layer (Django). config/ = project, shell/ = OmniView itself,
                  apps/<app>/ = one package per dashboard app.
frontend/         the Next.js static export Django serves.
pipelines/        the ETL. common/ = shared helpers, <app>/ = one package per app with a pipeline.
Data/             PRODUCTION DATA. Git-ignored. Never read or written by tests.
docker/           LOCAL dev/test environment (Dockerfile, compose, entrypoint). Not production.
deploy/           production deployment, one dir per target: deploy/databricks/ (spec, manifest,
                  build_app.py, tear_down.py, provision_db.py, databricks_start.py).
docs/             ARCHITECTURE.md (structure contract), DEPLOYMENT.md (runbook), HANDOFF.md,
                  ARTIFACTS.md (manifest of every resource the project creates), examples/.
.claude/skills/   adding-an-omniview-app, adding-a-bank, build-omniview (deploy + test),
                  teardown, generate-artifact-manifest.
```

Four root files are position-locked: `README.md` (named by `pyproject.toml`'s `readme =`),
`CLAUDE.md` (auto-loaded from the root), `pyproject.toml`/`uv.lock` (pytest rootdir + `pythonpath`),
and `.dockerignore` (Docker reads it from the build-context root, not from `docker/`).

The web layer and the pipelines never import each other. The web layer *runs* a pipeline as a
subprocess (`backend/shell/pipeline.py`, which knows no app names), and the pipeline reads
Django-owned tables by raw SQL. Their only shared contract is a handful of table names, asserted from
both sides in `backend/config/tests/test_schema_contract.py`.

**→ `docs/ARCHITECTURE.md` is the full structure contract.** Read it before moving code between
packages or adding an app.

## Running

Python dependencies are managed with `uv` (`pyproject.toml` / `uv.lock`, requires Python >= 3.13).

Run an app's pipeline from the repo root — `-m` puts the root on `sys.path`, which is what makes the
`pipelines.*` imports resolve (the same reason the Rebuild button shells out with `-m`):

```
docker compose -f docker/docker-compose.yml up -d db
uv run python -m pipelines.expense_tracker.main
```

First-time setup loads ExpenseTracker's source rows: `cd backend && uv run python manage.py migrate &&
uv run python manage.py import_banks_dir ..\Data\Banks` (upsert; safe to re-run).

Test suites (all must pass before committing web-layer changes):
- `uv run pytest` — backend suite (`config.settings.test`: in-memory SQLite, sentinel data paths —
  the fast unit tier deliberately stays off Postgres).
- `cd frontend && npm run test` — Vitest component/unit suite.
- `cd frontend && npm run e2e` — Playwright E2E (builds the export, then serves the dedicated
  `omniview_e2e` database on port 8100; needs the compose db running).

dbt runs its own data tests as part of `dbt build`.

## The shell

- **`backend/`** — Django 6 + django-ninja, split three ways: `config/` (settings, urls, NinjaAPI, DB
  router), `shell/` (auth, security, log ingestion, the pipeline runner, the app **registry**), and
  `apps/<app>/` (one package per dashboard app). The two schemas are two connection aliases differing
  only by `search_path`: `default` → `omniview`, `datavault` → `datavault` (read via unmanaged
  models). `config/db_router.py` routes by the model's `managed` flag and keeps migrations off
  `datavault`; `docker/entrypoint.sh` ensures the schemas and migrates on container start. Session
  auth on the first-party `/api/auth` router; django-allauth only for the env-driven Microsoft Entra
  ID redirect flow (`/accounts/microsoft/login/`). `OMNIVIEW_AUTH_REQUIRED` defaults ON. Request-ID
  logging middleware + auth signals + pipeline logging under `omniview.*`.
- **`frontend/`** — Next.js 16 App Router, React 19, **TypeScript only**, static export
  (`output: "export"` — no middleware/server actions). shadcn/ui + Tailwind v4, next-themes
  class-based dark mode. Route groups: `(auth)/login` (chrome-less) and `(shell)/` (header,
  off-canvas sidebar, launcher home, fullscreen-able `#app-viewport`). App pages live under
  `(shell)/apps/<app-id>/`, app code under `src/apps/<app-id>/`; shared fetch core in
  `src/lib/http.ts` (credentials + CSRF + 401 event), auth context in `src/lib/auth.tsx`, logging in
  `src/lib/log.ts`. See `frontend/AGENTS.md` for the frontend's own rules.
- **Adding an app** — see the `adding-an-omniview-app` skill. One registration in
  `backend/shell/registry.py` drives INSTALLED_APPS, the `/api/<id>/` mount and its auth, datavault
  routing, the grantable-app list and legacy redirects; `frontend/src/apps/registry.ts` is its
  mirror, and `shell/tests/test_registry.py` fails if the two disagree on ids.
- **Access is deny-by-default**: non-staff users need an `AppAccess` grant (managed in the Admin
  Portal), staff bypass. An app does not implement its own gating.
- **Never rename a Django app label.** Labels are pinned in every AppConfig and `db_table` on every
  managed model, because the label is what Django derives table names from — and
  `budgets_budgetmapdocument` / `rawdata_rawfile` hold production data *and* are named literally in
  the pipeline's raw SQL. Packages may move freely; labels may not.
  `config/tests/test_schema_contract.py` is the tripwire.

## `datavault` conventions

Binding on **any** app that builds tables there, not just ExpenseTracker's:

- **Relation names are `{layer}_{App-or-Bank}_{TableName}` CamelCase**; dbt-postgres quotes them, so
  `db_table` stays CamelCase on the Django side.
- **Columns are lowercase.** Models write unquoted CamelCase SQL, which Postgres folds; Django's
  unmanaged models keep CamelCase field names (API JSON unchanged) over lowercase `db_column`s.
- **`*SK` is a cross-app contract, not a style.** Surrogate keys end in `SK`, and dates carry an
  integer `DateSK` (`YYYYMMDD`) alongside `YYYY-MM-DD` TEXT. Omni-ERD's `infer.py` derives its
  diagram edges from this convention — an app that ignores it silently degrades a *different* app.
- **No foreign keys exist, ever** — dbt builds via CTAS, which carries no constraints. Anything
  needing relationships must add them explicity through a post-hook or must infer them.
- **Gold casts money to `double precision`** so ORM consumers see floats; bronze/silver keep DECIMAL
  for exact arithmetic.
- **A rebuild drops and recreates the whole schema**, which is why nothing Django owns may live here.

## Operational gotchas

- Port 8000 belongs to the user's production container — dev-verify on the compose app (8010) or a
  dev runserver, never 8000.
- Compose lives at `docker/docker-compose.yml`, so every command needs `-f docker/docker-compose.yml`
  (see `docker/README.md`). Run docker/compose commands from **PowerShell only** — Git Bash mangles
  Windows paths.
- django-ninja request bodies need an explicit `Schema` or `Body(...)`; a bare `dict` binds as query.
- Next 16, Django 6, django-ninja 1.6 and django-allauth are newer than model training data. Read the
  installed docs first — `frontend/node_modules/next/dist/docs/` and the packages under `.venv/` (the
  Grep tool can't search `.venv`; use shell grep).
