# backend/apps/expense_tracker/transactions/tests/

## Purpose
Tests for the transaction read APIs, currently the Breakdown feed.

## Role in OmniView
The Breakdown page does all of its pivoting, drilling and cross-filtering over
this one payload, so these tests pin what that payload promises: resolved
category names, an `Uncategorized` bucket instead of dropped rows, and the sign
convention every spend visual is drawn from.

## Contents
| Item | What it does |
|------|--------------|
| `test_breakdown.py` | Name resolution, uncategorized bucketing, date window, and the expense-sign tripwire. |

## Conventions & gotchas
- The unit tier seeds the gold relations from `datavault_schema.sql` (SQLite),
  so no pipeline run is needed; `pytestmark` must list both databases.
- The seed deliberately carries a **negative** deposit-account expense. That
  models the real Golden1 exports, not `docs/examples`, whose credit-card debits
  are signed the other way — see the tripwire's docstring.

## See also
- [transactions/](../README.md) · [expense_tracker/tests/](../../tests/README.md)
