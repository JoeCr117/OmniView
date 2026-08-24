# frontend/src/app/(shell)/apps/expense-tracker/

## Purpose
ExpenseTracker's route pages — one `page.tsx` per tab — plus the layout that
mounts its subnav. Thin wrappers; the real components live in
`src/apps/expense-tracker/`.

## Role in OmniView
Rendered under `/apps/expense-tracker/*`. Each page fetches through `useResource`
(shaped skeleton on first load, RefreshBar on refetch). Check Book and Daily
Trends share one cache key for the full daily-metrics history.

## Contents
| Item | What it does |
|------|--------------|
| `check-book/` | The Power BI-style daily ledger with year/month slicers. |
| `daily-trends/` | The balance-over-time chart + a paginated table. |
| `breakdown/` | The drillable matrix/waterfall/pie report, cross-filtered. |
| `budget-map/` | The BudgetMap CRUD editor + Save/Rebuild. |
| `raw-csvs/` | Per-account raw CSV viewer + upload. |
| `uncategorized/` | Paginated uncategorized-transactions table. |
| `layout.tsx` · `page.tsx` | The app subnav layout + the app index. |

## Conventions & gotchas
- Folder name (`expense-tracker`) is the app id — must match both registries.
- Tables use the shared `DataTable` (Tabulator, lazy-loaded).
- The API docs tab used to live here. It documents the *whole* OmniView API, not
  this app's slice, so it moved to
  [admin-portal/api-docs/](../admin-portal/api-docs/README.md) — which also made
  it staff-only.

## See also
- [apps/](../README.md) · [src/apps/expense-tracker/](../../../../apps/expense-tracker/README.md)
- [check-book/](check-book/README.md) · [daily-trends/](daily-trends/README.md) · [breakdown/](breakdown/README.md) · [budget-map/](budget-map/README.md) · [raw-csvs/](raw-csvs/README.md) · [uncategorized/](uncategorized/README.md)
