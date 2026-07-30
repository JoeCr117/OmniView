# backend/apps/expense_tracker/budgets/

## Purpose
Owns the BudgetMap: the nested category → subcategory → type → label →
string-match YAML that categorizes transactions. It stores that YAML as a managed
Postgres row, validates edits, and exposes the Rebuild trigger.

## Role in OmniView
The Budget Map editor page (frontend) reads/writes `/api/expense-tracker/budgets/*`
here. The stored YAML is production source data (survives rebuilds); the pipeline
reads it back by raw SQL to build the transaction map. The rebuild endpoints tie
the UI's "Rebuild Data" button to the ETL.

## Contents
| Item | What it does |
|------|--------------|
| `models.py` | `BudgetMapDocument` (managed, `budgets_budgetmapdocument`) + the unmanaged `BudgetMap` gold read. |
| `api.py` | `/map`, `/yaml` (GET/PUT), `/rebuild` (POST), `/rebuild/status` (GET). |
| `yaml_repository.py` | Load/save the YAML + `validate_budget_map` (subcategory budgets ≤ parent). |
| `schemas.py` | ninja response schemas (`BudgetMapOut`, `RebuildResult`). |
| `apps.py` | AppConfig with the pinned label. |
| `tests/` | Validation + repository tests. |

## Conventions & gotchas
- `db_table`/label are pinned — the table holds production data and is named
  literally in `pipelines/.../banks/source.py`.
- The budget invariant is enforced both here and in dbt (`tests/Budgets/CatToSubCatSums.sql`).
- ninja PUT bodies need an explicit `Body(...)` or they bind as query params.

## See also
- [expense_tracker/](../README.md) · [rawdata/](../rawdata/README.md) · [tests/](tests/README.md)
