# frontend/src/app/(shell)/apps/expense-tracker/check-book/

## Purpose
The Check Book: a Power BI-style daily ledger — one row per day of end-of-day
balances and transaction totals per account — with year/month slicer buttons
that filter client-side for instant clicks.

## Role in OmniView
Rendered at `/apps/expense-tracker/check-book`. Reads the full daily-metrics
history via `useResource(DAILY_METRICS_KEY, …)` — the same key Daily Trends uses,
so the ~730-row payload is fetched once and shared. Renders it in the shared
`DataTable` (Tabulator).

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | Slicers + the frozen-column checkbook grid; accounting-style currency. |

## Conventions & gotchas
- Slicer semantics mirror Power BI: plain click selects one, shift/ctrl toggles.
- First load shows a `TableSkeleton`; a refetch keeps the grid and shows a `RefreshBar`.

## See also
- [expense-tracker/](../README.md) · [daily-trends/](../daily-trends/README.md) · [lib/api.ts](../../../../../apps/expense-tracker/lib/README.md)
