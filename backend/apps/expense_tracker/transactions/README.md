# backend/apps/expense_tracker/transactions/

## Purpose
Read-only API over the gold transaction tables: all categorized transactions and
the uncategorized ones (descriptions that matched no BudgetMap string).

## Role in OmniView
Serves `/api/expense-tracker/transactions/*`. The Uncategorized page reads the
uncategorized endpoint (paginated) and the Breakdown page reads `/breakdown`;
the models are unmanaged and routed to `datavault`, so the pipeline owns the
underlying relations.

## Contents
| Item | What it does |
|------|--------------|
| `models.py` | Unmanaged models over the gold AllTransactions / UncategorizedTransactions relations. |
| `services.py` | Query helpers for the API: `breakdown_rows` and `budget_analysis`. |
| `api.py` | Transaction list + `/breakdown` + `/budget-analysis` + `/uncategorized` (paginated). |
| `schemas.py` | Response schemas. |
| `apps.py` | AppConfig with the pinned label. |
| `tests/` | Breakdown feed tests, including the expense-sign tripwire. |

## Conventions & gotchas
- Unmanaged + datavault-routed; no migrations own these tables.
- Uncategorized rows are the signal to add a BudgetMap match and rebuild.
- `Category`/`SubCategory` live only in `gold_Golden1_BudgetMap`. Gold carries no
  foreign keys, so both service functions join the ~30-row dimension in Python
  rather than in SQL — two queries, whatever the row count.
- `/breakdown` is deliberately unpaginated: the page pivots and cross-filters the
  whole window client-side, the way Check Book does with DailyMetrics.

## See also
- [expense_tracker/](../README.md) · [dailymetrics/](../dailymetrics/README.md) · [tests/](tests/README.md)
