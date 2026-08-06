# frontend/src/components/common/

## Purpose
The cross-app component library: the pieces more than one app needs — the data
grid, pager, async/error states, KPI card, skeletons, and progress bars — all
Tailwind-tokenized and dark-mode-correct.

## Role in OmniView
This is where shared UI lives so apps don't reach into each other. Everything here
was either extracted from an app (DataTable ← ExpenseTracker's TabulatorTable) or
built to dedupe copies (KpiCard replaced four near-identical `Kpi`s). QOL5 added
the progress affordances.

## Contents
| Item | What it does |
|------|--------------|
| `DataTable.tsx` | The one Tabulator grid (lazy-loads Tabulator on mount). |
| `Pager.tsx` | Offset/limit pager. |
| `AsyncState.tsx` | `Loading` + `ErrorState` (shadcn Retry). |
| `AdminGate.tsx` | Staff-only client gate for a page (Admin Portal, Omni-ERD Relationships). |
| `KpiCard.tsx` | The shared KPI card (optional link). |
| `skeletons.tsx` | `KpiSkeleton` / `ChartSkeleton` / `TableSkeleton` (shaped placeholders). |
| `progress.tsx` | `RefreshBar` (indeterminate refetch sliver) + `ProgressBar` (determinate/busy). |

## Conventions & gotchas
- Skeletons are for *first* load; a refetch over existing data uses `RefreshBar`
  and keeps the content (that's what `useResource` drives).
- `DataTable` builds Tabulator once and flows data in via `setData` — it never
  rebuilds on prop identity changes (that would drop sort/scroll state).

## See also
- [components/](../README.md) · [lib/useResource.ts](../../lib/README.md) · [charts/](../charts/README.md)
