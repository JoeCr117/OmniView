# backend/apps/expense_tracker/budgets/tests/

## Purpose
Tests for the budget-map repository and its validation rule.

## Role in OmniView
Guards the "subcategory budgets must not exceed the parent category's budget"
invariant and the YAML load/save round-trip that the Budget Map editor depends
on — before a bad map can reach a rebuild.

## Contents
| Item | What it does |
|------|--------------|
| `test_yaml_repository.py` | Load/save round-trips + `validate_budget_map` accept/reject cases. |

## Conventions & gotchas
- Runs on the SQLite unit tier with an in-memory `BudgetMapDocument` row — never
  touches `Data/`.

## See also
- [budgets/](../README.md) · [expense_tracker/tests/](../../tests/README.md)
