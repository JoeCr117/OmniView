# pipelines/expense_tracker/dbt/tests/Budgets/

## Purpose
Budget-invariant data tests: SQL assertions that the built budget tables obey the
same rule the app enforces — a subcategory's budgets never exceed its parent
category's budget.

## Role in OmniView
Runs during `dbt build`. It's the warehouse-side mirror of the validation in
`budgets/yaml_repository.py` and the live check in the Budget Map editor, so the
invariant holds end-to-end (UI → API → warehouse).

## Contents
| Item | What it does |
|------|--------------|
| `CatToSubCatSums.sql` | Fails if any category's subcategory budgets sum above its own budget. |

## Conventions & gotchas
- A dbt data test passes when the query returns **zero** rows — the SQL selects
  the *violations*.

## See also
- [tests/](../README.md) · [backend budgets](../../../../../backend/apps/expense_tracker/budgets/README.md)
