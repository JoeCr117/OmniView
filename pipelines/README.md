# pipelines/

## Purpose
The ETL layer: home of every OmniView app's data pipeline. `common/` holds what
any pipeline reuses; each `<app>/` package is one app's pipeline, owning its own
parsing and its own dbt project. A pipeline is run as a subprocess, never
imported by the backend.

## Role in OmniView
One of the three top-level layers, and an **optional one per app** — an app has a
pipeline only if it builds tables of its own. Today only ExpenseTracker does; the
other registered apps read their sources live.

The backend triggers a pipeline through `shell/pipeline.py`
(`python -m pipelines.<app>.main`), which knows no app names — the binding lives
in the app, as one constant in `backend/apps/<app>/pipeline.py`. The web layer
then reads the resulting `datavault` tables through unmanaged ORM models. The
only coupling is a handful of table names, asserted from both sides.

## Contents
| Item | What it does |
|------|--------------|
| `common/` | What any pipeline reuses: `process` (run_command/timed), `paths` (temp_cd), `postgres` (pg_engine + schema names), `pydbt` (fluent dbt-CLI wrapper). |
| `expense_tracker/` | The ExpenseTracker pipeline: bank CSVs → staged tables → dbt. The only app with a pipeline today. |
| `__init__.py` | Marks the package so `-m pipelines.<app>.main` resolves. |

## Wiring a pipeline to an app
1. `pipelines/<app>/main.py` — the entry point. Take connection handling and dbt
   invocation from `common/`; don't re-solve either.
2. `backend/apps/<app>/pipeline.py` — call
   `run_pipeline('pipelines.<app>.main', settings.PIPELINE_ROOT)` and expose it
   on the app's own router.

That is the whole seam. `shell/pipeline.py` stays app-agnostic, so a second
pipeline changes nothing outside its own `<app>/` package and that one binding.

## Conventions & gotchas
- Run from the **repo root** (`uv run python -m pipelines.expense_tracker.main`);
  `-m` puts the root on `sys.path`.
- A pipeline is not a Django process — it reads Django-owned tables by raw SQL
  and names them literally (kept in sync via the schema contract test).
- A rebuild **drops and recreates** that app's `datavault` tables, which is why
  nothing Django owns may live in `datavault`.
- The deploy bundle prunes every `tests` directory out of `backend/` but keeps
  the pipelines' — dbt data tests are production code.
- Never run a pipeline against Lakebase with personal creds (ownership rule).

## See also
- [Repo root](../README.md) · [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) · [CLAUDE.md](../CLAUDE.md)
- [common/](common/README.md) · [expense_tracker/](expense_tracker/README.md)
- [backend/shell/](../backend/shell/README.md) — the runner that invokes these.
