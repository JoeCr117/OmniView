# backend/apps/expense_tracker/

## Purpose
The ExpenseTracker dashboard app's backend: it composes four Django apps
(budgets, rawdata, transactions, dailymetrics) into one API namespace and binds
the Rebuild endpoint to the ExpenseTracker pipeline. It is OmniView's first
registered app.

## Role in OmniView
`omniview_app.py` declares this app to the shell; that one declaration mounts
`api.py`'s composed router at `/api/expense-tracker/`, routes its unmanaged
models to `datavault`, and lists it as grantable. The four Django apps split the
domain: source data (rawdata/budgets, managed, in `omniview`) vs. dbt output
(transactions/dailymetrics, unmanaged, in `datavault`).

## Contents
| Item | What it does |
|------|--------------|
| `omniview_app.py` | The app's declaration to the shell (id, router, django apps, datavault labels, legacy pages). |
| `api.py` | Composes the four sub-routers into one, mounted at `/api/expense-tracker/`. |
| `pipeline.py` | Thin binding: `run_rebuild()` → `shell.run_pipeline("pipelines.expense_tracker.main", …)` + `is_rebuild_running()`. |
| `budgets/` | Budget-map YAML CRUD + validation + the Rebuild endpoint (managed source data). |
| `rawdata/` | Raw bank-CSV storage/upload + the import command (managed source data). |
| `transactions/` | Reads gold transaction tables (unmanaged, datavault). |
| `dailymetrics/` | Reads the gold DailyMetrics table (unmanaged, datavault). |
| `tests/` | The app's fixtures + the data they load. |

## Conventions & gotchas
- `budgets`/`rawdata` labels name **production** tables literally used by the
  pipeline's SQL — pinned, never renamed.
- The Rebuild endpoint runs the whole dbt pipeline synchronously in the request
  (gunicorn `--timeout 600`).

## See also
- [apps/](../README.md) · [pipelines/expense_tracker/](../../../pipelines/expense_tracker/README.md)
- [budgets/](budgets/README.md) · [rawdata/](rawdata/README.md) · [transactions/](transactions/README.md) · [dailymetrics/](dailymetrics/README.md) · [tests/](tests/README.md)
