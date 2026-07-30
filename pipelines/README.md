# pipelines/

## Purpose
The ETL layer: it parses bank transaction CSVs, categorizes them against a budget
map, stages them into Postgres, and runs a dbt project (bronze → silver → gold)
to produce the analysis tables the web layer reads. It is run as a subprocess,
never imported by the backend.

## Role in OmniView
One of the three top-level layers. The backend triggers a pipeline via
`shell/pipeline.py` (`python -m pipelines.<app>.main`) and reads the resulting
`datavault` tables through unmanaged ORM models. The only coupling is a handful
of table names, asserted from both sides.

## Contents
| Item | What it does |
|------|--------------|
| `common/` | What any pipeline reuses: `process` (run_command/timed), `paths`, `postgres`, `pydbt`. |
| `expense_tracker/` | The ExpenseTracker pipeline: `main.py`, `banks/`, `dbt/`. |
| `__init__.py` | Marks the package so `-m pipelines.<app>.main` resolves. |

## Conventions & gotchas
- Run from the **repo root** (`uv run python -m pipelines.expense_tracker.main`);
  `-m` puts the root on `sys.path`.
- The pipeline is not a Django process — it reads Django-owned tables by raw SQL
  and names them literally (kept in sync via the schema contract test).
- Never run it against Lakebase with personal creds (ownership rule).

## See also
- [Repo root](../README.md) · [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) · [CLAUDE.md](../CLAUDE.md)
- [common/](common/README.md) · [expense_tracker/](expense_tracker/README.md)
