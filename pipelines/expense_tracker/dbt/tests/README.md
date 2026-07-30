# pipelines/expense_tracker/dbt/tests/

## Purpose
The dbt project's own **data** tests — assertions about the built tables that run
as part of `dbt build`. These are production code, not scaffolding.

## Role in OmniView
Every rebuild runs these; a failing data test fails the build, so bad data can't
silently land in `datavault`. The deploy bundle prunes `tests/` out of `backend/`
but **keeps these** (`deploy/databricks/build_app.py`).

## Contents
| Item | What it does |
|------|--------------|
| `Budgets/` | Budget-invariant data tests. |

## Conventions & gotchas
- These are dbt *data* tests (singular SQL tests), distinct from the backend's
  pytest suite. Don't confuse the two when the deploy bundle prunes test dirs.

## See also
- [dbt/](../README.md) · [Budgets/](Budgets/README.md)
