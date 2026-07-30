# frontend/src/app/(shell)/apps/expense-tracker/budget-map/

## Purpose
The full CRUD editor for the BudgetMap: add/rename/delete categories and
subcategories, edit budgets inline, edit the per-subcategory string-match JSON,
Save, and Rebuild the warehouse.

## Role in OmniView
Rendered at `/apps/expense-tracker/budget-map`. Reads/writes
`/api/expense-tracker/budgets/yaml` and triggers `/budgets/rebuild`. The budget
invariant (subcategory budgets ≤ parent) is validated live and blocks Save,
mirroring the server-side rule.

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | Tabulator tree editor + Save + Rebuild (indeterminate bar + elapsed timer + reconnect). |

## Conventions & gotchas
- Rebuild is a multi-minute synchronous ETL; the page reconnects to an in-flight
  rebuild on reload via `GET /budgets/rebuild/status`.
- The deep Type→Label→[StringMatch] tree is edited as JSON in a side panel (a
  deliberate MVP scope cut).

## See also
- [expense-tracker/](../README.md) · [backend budgets](../../../../../../../backend/apps/expense_tracker/budgets/README.md)
