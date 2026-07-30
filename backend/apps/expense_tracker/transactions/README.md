# backend/apps/expense_tracker/transactions/

## Purpose
Read-only API over the gold transaction tables: all categorized transactions and
the uncategorized ones (descriptions that matched no BudgetMap string).

## Role in OmniView
Serves `/api/expense-tracker/transactions/*`. The Uncategorized page reads the
uncategorized endpoint (paginated); the models are unmanaged and routed to
`datavault`, so the pipeline owns the underlying relations.

## Contents
| Item | What it does |
|------|--------------|
| `models.py` | Unmanaged models over the gold AllTransactions / UncategorizedTransactions relations. |
| `services.py` | Query helpers for the API. |
| `api.py` | Transaction list + `/uncategorized` (paginated). |
| `schemas.py` | Response schemas. |
| `apps.py` | AppConfig with the pinned label. |

## Conventions & gotchas
- Unmanaged + datavault-routed; no migrations own these tables.
- Uncategorized rows are the signal to add a BudgetMap match and rebuild.

## See also
- [expense_tracker/](../README.md) · [dailymetrics/](../dailymetrics/README.md)
