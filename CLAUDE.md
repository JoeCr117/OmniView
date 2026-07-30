# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

Parses bank transaction CSVs, categorizes transactions against a budget map, loads everything into
Postgres, and runs a dbt project (bronze/silver/gold layers) to produce budget analysis tables,
served by the **OmniView web app** (Next.js frontend served by a Django/Ninja backend — see
"OmniView web layer" below). A deployment = **one Postgres database, two schemas**: `omniview`
(Django auth/sessions + the source data: raw CSV text in `rawdata_rawfile`, budget-map YAML in
`budgets_budgetmapdocument` — survives rebuilds) and `datavault` (staged `stg_*` tables + everything
dbt builds — dropped/recreated per rebuild). Locally that database is the docker-compose `db`
service (postgres:17); in the cloud it is Databricks Lakebase, where the app runs as a Databricks
App (see docs/DEPLOYMENT.md "Databricks Apps + Lakebase"; every created workspace resource is listed in
`deploy/databricks/databricks_manifest.json`, torn down only via `deploy/databricks/tear_down.py`).
Connection config is libpq-standard `PG*` env vars everywhere, defaulting to the compose service.

**`Data/` is production data** — the original bank CSVs and BudgetMap (now the one-time
import source / backup; the app reads only the DB copies). Tests must never read or write it: the
unit tier uses in-memory DBs + fixtures, and the E2E tier uses a dedicated `omniview_e2e` database.
(A legacy Power BI report over SQLite ODBC existed pre-Postgres and is retired.)
**It is also entirely git-ignored** and must stay that way — the budget map's own category tree
names a real person's employer, landlord, insurers and medical providers. `docs/examples/Banks/`
is the synthetic public stand-in for the format; see `docs/examples/README.md`.

**This repo is public.** Three files are deliberately git-ignored deployment state rather than
source, each with a tracked `*.example.*` template beside it:
`deploy/databricks/databricks_manifest.json` (live workspace host, Lakebase endpoint, app SP),
`deploy/databricks/app.yaml` (admin allow-list, app URL, warehouse id), and `docker/.env`.
Do not commit real hostnames, service-principal ids, workspace paths or email addresses into
tracked files — use placeholders like `<your-workspace-user>` in docs.

## Repo layout

```
backend/          the web layer (Django). config/ = project, shell/ = OmniView itself,
                  apps/<app>/ = one package per dashboard app.
pipelines/        the ETL. common/ = shared helpers, <app>/ = one package per app with a pipeline.
frontend/         the Next.js static export Django serves.
Data/             PRODUCTION DATA. Git-ignored. Never read or written by tests.
docker/           LOCAL dev/test environment (Dockerfile, compose, entrypoint). Not production.
deploy/           production deployment, one dir per target: deploy/databricks/ (spec,
                  manifest, build_app.py, tear_down.py, provision_db.py, databricks_start.py).
docs/             ARCHITECTURE.md (structure contract), DEPLOYMENT.md (runbook), HANDOFF.md (working state),
                  ARTIFACTS.md (manifest of every resource the project creates),
                  examples/ (synthetic sample data — the public stand-in for Data/).
.claude/skills/   build-omniview (deploy local/cloud/both + test), teardown (destroy everything in
                  ARTIFACTS.md), generate-artifact-manifest (rewrite it).
```

Four root files are position-locked and must not be moved: `README.md` (named by `pyproject.toml`'s
`readme =`), `CLAUDE.md` (auto-loaded from the root), `pyproject.toml`/`uv.lock` (pytest rootdir +
`pythonpath`), and `.dockerignore` (Docker reads it from the build-context root, not from `docker/`).

The web layer and the pipelines never import each other. The web layer *runs* a pipeline as a
subprocess (`backend/shell/pipeline.py`), and the pipeline reads the tables Django owns by raw SQL.
Their only shared contract is a handful of table names, asserted from both sides in
`backend/config/tests/test_schema_contract.py`.

**→ `docs/ARCHITECTURE.md` is the full structure contract**: what lives where, why Django app labels are
pinned, how the app registry works, and the exact checklist for adding a new OmniView app. Read it
before moving code between packages or adding an app.

## Running

Python dependencies are managed with `uv` (see `pyproject.toml` / `uv.lock`, requires Python >= 3.13).

```
uv run python -m pipelines.expense_tracker.main
```

Run it from the repo root — `-m` puts the root on `sys.path`, which is what makes the
`pipelines.*` imports resolve (the same reason the Rebuild button shells out with `-m`).
`main.py` is structured as a Jupyter-style script (`# %%` cells) meant to also be run interactively.
It does the following, in order (requires the compose `db` service: `docker compose -f docker/docker-compose.yml up -d db`):
1. Loads each bank's source data from Postgres via `banks.load_bank_sources` (budget-map YAML +
   per-account CSV text from the `omniview` schema) and builds a `Bank` object per source via
   `banks.bank_factory`.
2. Stages each bank's parsed data into the `datavault` schema (`bank.to_sql(engine)`, one table per
   account: `stg_{BankName}_{AccountName}`, plus a `stg_{BankName}_BudgetMap` table, replaced per run).
3. `cd`s into its `dbt/` (via `pipelines.common.temp_cd`) and runs the dbt project end-to-end
   (`pydbt.DBT().run_all()`: debug -> clean -> deps -> build, optionally docs generate/serve).

First-time setup loads the source rows: `cd backend && uv run python manage.py migrate &&
uv run python manage.py import_banks_dir ..\Data\Banks` (upsert; safe to re-run).

Test suites (all must pass before committing web-layer changes):
- `uv run pytest` — backend suite (runs under `config.settings.test`: in-memory SQLite, sentinel data
  paths — the fast unit tier deliberately stays off Postgres).
- `cd frontend && npm run test` — Vitest component/unit suite.
- `cd frontend && npm run e2e` — Playwright E2E (builds the export, then serves the dedicated
  `omniview_e2e` Postgres database on port 8100; needs the compose db running — see docs/DEPLOYMENT.md
  "End-to-end tests").

dbt additionally runs its own data tests as part of `dbt build` (see below).

### Running dbt directly

dbt commands are normally issued through the `pydbt.DBT` fluent wrapper (`pipelines/common/pydbt/core.py`),
not the raw CLI, so that project-dir/profiles-dir/log-path args stay consistent. If you need to run dbt
manually from a shell, `cd pipelines/expense_tracker/dbt` first and use `--profiles-dir .` (profile
`TransactionProfiles`, single target `pg` = dbt-postgres, defined in that dir's `profiles.yml`;
credentials come from the `PG*` env vars with compose-matching defaults, models land in the
`datavault` schema).

dbt data tests live in the dbt project's `tests/` (e.g. `tests/Budgets/CatToSubCatSums.sql` asserts
subcategory budgets never exceed their parent category's budget) and run as part of `dbt build`.
Note the deploy bundle prunes every `tests` directory out of `backend/` but keeps the pipelines'
(`deploy/databricks/build_app.py`) — these ones are production code.

## Architecture

Paths below are relative to `pipelines/expense_tracker/` for §1–2 and `pipelines/common/` for §3.

### 1. Bank ingestion (`banks/`)

`Bank` (`banks/bank.py`) is an abstract base class representing one financial institution:
- Constructed from a `BankSource` (`banks/source.py`): the bank's budget-map ("transaction map")
  YAML text plus per-account lists of `(filename, csv_text)`, loaded from the `omniview` schema by
  `load_bank_sources(engine)` (plain SQLAlchemy — a pipeline is not a Django process, so it names
  `rawdata.RawFile`'s and `budgets.BudgetMapDocument`'s tables literally, via the `RAW_FILE_TABLE` /
  `BUDGET_MAP_TABLE` constants that `test_schema_contract.py` checks against the models).
- `_validate_bank()` enforces that structure (non-empty map, every account has CSVs) before parsing.
- `_parse_transaction_map()` reads the bank's YAML budget/category map and flattens the nested
  `Category -> SubCategories -> Type -> Label -> [StringMatch, ...]` structure into a flat DataFrame
  (one row per string match), computing a `CategorySK` hash key from `(Category, SubCategory)`.
- Subclasses implement `_parse_transactions() -> dict[str, pd.DataFrame]`, one DataFrame per account
  folder, keyed by account name. `Golden1` (`banks/all_banks/golden1.py`) is the only implementation:
  it concatenates each account's CSVs, derives `DateSK`/`Date`, and for the `CreditCard` account
  recomputes intraday running balances anchored to a known true balance on a known date
  (`_fix_intraday_balance`) because Golden1's exported CSV balances aren't reliable intraday.
- `_map_categories()` then does a string-containment match of each transaction's `Description` against
  every `StringMatch` value in the transaction map (first match wins) and left-joins in the matched
  category/subcategory/budget columns.
- `to_sql(engine)` writes each account DataFrame to its own table in the `datavault` schema
  (`stg_{Bank}_{Account}`), replacing any existing table. Columns are lowercased at staging so every
  downstream dbt model can use unquoted identifiers (Postgres folds them to lowercase).
- `banks/factory.py`'s `bank_factory(source)` maps a bank name to its concrete `Bank` subclass
  (currently only `'Golden1'` is registered; unknown names raise) — **adding a new bank requires
  adding a case here and a new subclass in `banks/all_banks/`.**

### 2. dbt layering (`dbt/models/`)

Medallion architecture, one folder per layer, with a subfolder per bank inside each layer:
- `0-stg`: source definitions only (`0-sources.yml`), pointing at the `stg_*` tables the Python layer
  staged into the `datavault` schema.
- `1-bronze`: near-1:1 typed casts of the staged tables (one gold/bronze model per account + one for
  `BudgetMap`).
- `2-silver`: cleaned/reshaped tables — e.g. `silver_Golden1_DailyBalances`, `silver_Golden1_DailyTransactions`.
- `3-gold`: analysis-ready tables — `gold_Golden1_AllTransactions`, `gold_Golden1_BudgetAnalysis`,
  `gold_Golden1_BudgetMap`, `gold_Golden1_DailyMetrics`, `gold_Golden1_UncategorizedTransactions`, plus a
  bank-agnostic `gold_DimDate` calendar dimension.
- Model tags/materialization/`node_color` (for dbt docs) are configured per-layer in `dbt/dbt_project.yml`,
  not per-model.
- Everything lives in the single `datavault` schema with `{layer}_{Bank}_{TableName}` names — a
  SQLite-era convention kept through the Postgres port so Django's unmanaged models and their
  `db_table` values never changed (see `dbt/models/README.md`). Same for dates: carried as
  `YYYY-MM-DD` TEXT alongside integer `DateSK` (`YYYYMMDD`) surrogate keys for joins/sorting.
- Identifier casing: models write unquoted CamelCase SQL, which Postgres folds to lowercase in-db;
  Django's unmanaged models keep CamelCase field names (API JSON unchanged) over lowercase
  `db_column`s. Relation names (`db_table`) stay CamelCase — dbt-postgres quotes them.
- Bronze models (and `gold_DimDate`) declare indexes via dbt-postgres's native
  `indexes=[{'columns': [...]}]` model config.
- Gold views cast money columns to `double precision` so ORM consumers see floats (bronze/silver
  keep DECIMAL for exact arithmetic).
- Gold defaults to `view`, but `gold_Golden1_DailyMetrics` is `materialized='table'`: it LEFT JOINs
  two silver views whose running/intraday-balance window functions recompute over the whole partition
  on every read (a `LIMIT` can't prune them), which made the app's hottest read — Check Book / Daily
  Trends — a fixed ~1s regardless of page size. As a table a rebuild computes it once and the read is
  a ~30ms scan; the ORM reads the same relation name either way.

### 3. `pipelines/common/` — what any pipeline can reuse

- `pydbt/` is not a dbt package — it's a small first-party fluent builder around invoking the `dbt`
  CLI as a subprocess. `DBT` (`pydbt/core.py`) accumulates validated CLI args (`set_project_dir`,
  `set_select`, `set_vars`, ...) via a private `_set`/`_used_keys` mechanism that rejects setting the
  same flag twice and validates types against `DBT_ARGS_N_TYPES` (`pydbt/types.py`).
  `_temporarily_remove_args` is used internally so `run_deps()` can drop `--project-dir` (which
  `dbt deps` doesn't accept) without disturbing the rest of the configured args. High-level methods
  (`run_debug`, `run_clean`, `run_build`, `run_docs_generate/serve`) each shell out via `run_command`
  (raises `RuntimeError` on non-zero exit) and are composed by `run_all()`.
- `process.py` (`run_command`, `timed`), `paths.py` (`temp_cd`), `postgres.py` (`pg_engine` + the
  schema names). `run_command`/`timed` used to exist twice — once in `utils/common.py` and once in
  `pydbt/utils.py` — and the copies had drifted; there is now one of each.

## OmniView web layer

**OmniView** is a multi-app dashboard shell. Three apps are registered: **ExpenseTracker** (its
first), **Omni-ERD** (read-only entity-relationship diagrams over live database catalogs) and the
**Admin Portal** (users, access, Databricks costs/jobs, and the OpenAPI reference). One Docker
container serves everything: Django (gunicorn, port 8000) serves the Next.js **static export** from
`frontend/out/` plus all `/api/*` routes same-origin. `docs/HANDOFF.md` carries the current working
state; `docs/DEPLOYMENT.md` covers running, env vars, and verification.

- **`frontend/`** — Next.js 16 App Router, React 19, **TypeScript only**, static export
  (`output: "export"` — no middleware/server actions). shadcn/ui + Tailwind v4, next-themes
  class-based dark mode, Tabulator tables. Route groups: `(auth)/login` (chrome-less) and `(shell)/`
  (header, off-canvas sidebar, launcher home, fullscreen-able `#app-viewport`). App pages live under
  `(shell)/apps/<app-id>/`; app-specific components/lib under `src/apps/<app-id>/`; shared fetch core
  in `src/lib/http.ts` (credentials + CSRF + 401 event), auth context in `src/lib/auth.tsx`, logging
  in `src/lib/log.ts` (loglevel + shipper to `POST /api/logs/frontend`). Tabulator tables and
  Recharts charts are lazy-loaded, as is the React Flow canvas Omni-ERD draws on — note its route
  layout is a **flex column**, not the bare fragment the other apps use, because React Flow measures
  its container on mount and `ViewportPane` gives a fragment no definite height.
- **`backend/`** — Django 6 + django-ninja, split three ways: `config/` (the Django project —
  settings, urls, the NinjaAPI, the DB router), `shell/` (OmniView itself — auth, security, log
  ingestion, the pipeline runner, the app **registry**), and `apps/<app>/` (one package per dashboard
  app, owning its Django apps, routers, services and tests). **One Postgres database, two aliases**
  differing only by `search_path`: `default` → schema `omniview` (auth/sessions/admin + the managed
  source-data models `rawdata.RawFile` / `budgets.BudgetMapDocument` — survives pipeline rebuilds;
  schemas ensured + migrated on container start by `docker/entrypoint.sh`) and `datavault` →
  schema `datavault` (the dbt gold tables, read via unmanaged models). `config/db_router.py` routes by
  the model's `managed` flag and keeps migrations off `datavault`. Session auth on the first-party
  `/api/auth` router; django-allauth only for the Microsoft Entra ID redirect flow
  (`/accounts/microsoft/login/`, entirely env-driven — see docs/DEPLOYMENT.md). `OMNIVIEW_AUTH_REQUIRED`
  defaults ON. Request-ID logging middleware + auth signals + pipeline logging under `omniview.*`.
- **Adding a new app to the dashboard.** Backend: create `backend/apps/<app>/` with an
  `omniview_app.py` declaring an `OmniViewApp` (see `backend/shell/appspec.py` for the fields) and an
  `api.py` exposing a `router`, then add it to `OMNIVIEW_APPS` in `backend/shell/registry.py`. That
  single registration is what drives `INSTALLED_APPS`, the `/api/<id>/` mount and its auth, datavault
  DB routing, the grantable-app list the Admin Portal offers, and any legacy redirects — they were
  four separate hand-maintained lists before, and nothing kept them in agreement. Frontend: add an
  `AppDefinition` to `frontend/src/apps/registry.ts` (drives launcher, sidebar and subnav), create
  routes under `frontend/src/app/(shell)/apps/<id>/`, and app code under `src/apps/<id>/`.
  `shell/tests/test_registry.py` fails if the two registries disagree on app ids.
  App access is deny-by-default: non-staff users need an `AppAccess` grant (managed in the Admin
  Portal); staff bypass and see everything.
- **Omni-ERD** (`backend/apps/omni_erd/`, `frontend/src/apps/omni-erd/`) draws ERDs from live
  catalogs. Its seam is `ir.py`, a dialect-agnostic schema document: `introspect/postgres.py`
  (live, over the existing Django connection aliases) and `introspect/databricks.py` (Unity
  Catalog, written but unwired) both produce it, and the React Flow canvas consumes only it.
  Because `datavault` declares **no** foreign keys — dbt builds via CTAS, which carries none —
  `infer.py` derives edges from the `*SK` surrogate-key convention and marks them as guesses.
  Read-only against every database it inspects; the one thing it writes is `omnierd_erdlayout`
  (saved node positions), which lives in `omniview` so a rebuild cannot drop it.
- **Never rename a Django app label.** Labels are pinned explicitly in every AppConfig, and
  `db_table` is pinned on every managed model, because the label is what Django derives table names
  from — and `budgets_budgetmapdocument` / `rawdata_rawfile` hold production data *and* are named
  literally in the pipeline's raw SQL, which the ORM cannot keep in step. Packages may move freely;
  labels may not. `config/tests/test_schema_contract.py` is the tripwire.
- **Version warning**: Next 16, Django 6, django-ninja 1.6, and django-allauth are newer than model
  training data. Read the installed docs first — `frontend/node_modules/next/dist/docs/` and the
  packages under `.venv/` (the Grep tool can't search `.venv`; use shell grep).
- **Operational gotchas**: port 8000 belongs to the user's production container — dev-verify on
  the compose app (8010) or a dev runserver, never 8000; compose lives at
  `docker/docker-compose.yml`, so every command needs `-f docker/docker-compose.yml` (see
  `docker/README.md`); docker/compose commands from PowerShell only
  (Git Bash mangles Windows paths); django-ninja bodies need explicit `Schema`/`Body(...)` (bare
  `dict` binds as query).

## Adding a new bank

1. Get the bank's source data into the DB: either build a `<NewBank>/` directory (root `.yml`
   transaction map — same nested `Category -> SubCategories -> {Budget, Type -> Label ->
   [StringMatch,...]}` shape as Golden1's — plus one subdirectory per account containing that
   account's CSVs) and run `manage.py import_banks_dir` on its parent, or create the
   `BudgetMapDocument` + `RawFile` rows directly.
2. Add a `Bank` subclass under `pipelines/expense_tracker/banks/all_banks/` implementing
   `_parse_transactions`.
3. Register it in `pipelines/expense_tracker/banks/factory.py:bank_factory`.
4. Add matching `0-stg`/`1-bronze`/`2-silver`/`3-gold` models under
   `pipelines/expense_tracker/dbt/models/*/<NewBank>/`, following the Golden1 folder as a template,
   and add the new `stg_*` tables to a sources file under `0-stg`.
