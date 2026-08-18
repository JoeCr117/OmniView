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
  rebuilds on prop identity changes (that would drop sort/scroll state). A grid
  whose *shape* genuinely changes (columns appearing, a hierarchy level changing)
  remounts itself with a React `key`; see `BreakdownMatrix`.
- Row clicks go through `DataTable`'s `onRowClick` prop, not `options`: Tabulator
  6 moved `rowClick` out of the options object into its event system. It is
  registered once at build and dispatched through a ref, so a handler closing
  over React state is never stale. `onHeaderClick` works the same way, and
  carries the event too — Tabulator spends the *plain* header click on sorting,
  so a caller wanting a second meaning has to hang it on a modifier and needs to
  read which one was held.
- `headerClassNames` marks a header (field → class) without a rebuild. Using
  `cssClass` on the column definition would mean remounting, which costs the
  sort and scroll this component exists to preserve, so the class is applied to
  the header element instead. It is flushed on `tableBuilt` as well as on
  change: that event does not re-render, so an effect alone would silently never
  apply a class asked for before the grid finished building.

## See also
- [components/](../README.md) · [lib/useResource.ts](../../lib/README.md) · [charts/](../charts/README.md)
