# frontend/src/apps/expense-tracker/components/

## Purpose
ExpenseTracker's own composite components — the pieces more than one of its
pages needs, or that are too big to leave inline in a route file.

## Role in OmniView
Route pages under `app/(shell)/apps/expense-tracker/` stay thin by composing
these. Nothing here is cross-app: a component two *apps* need is promoted to
`components/common/` instead, and a chart primitive belongs in
`components/charts/`.

## Contents
| Item | What it does |
|------|--------------|
| `YearMonthSlicer.tsx` | The year/month slicer strips (Check Book and Breakdown). Selection lives with the caller. |
| `DrillToolbar.tsx` | The drill controls every Breakdown visual carries, plus the shared `ToolbarButton`. |
| `BreakdownMatrix.tsx` | The Breakdown matrix: nets by date/label × account, plus its expand-all control. |
| `BreakdownWaterfall.tsx` | Net transactions as a waterfall, over the date or the category hierarchy. |

## Conventions & gotchas
- **`BreakdownMatrix` keys its `DataTable` on the column signature.** `DataTable`
  builds Tabulator once and only streams `data` in, so a genuine change of shape
  (columns appearing, hierarchy level changing, expand-all toggling) has to
  remount it. The key excludes the rows themselves — a slicer click must not cost
  the reader their scroll position.
- **Tabulator captures its options once at build time.** A handler closing over
  React state goes stale, so the row-click handler is routed through a ref that
  each render refreshes (the pattern `useResource` uses for its fetcher).
- `dataTreeChildColumnCalcs` stays **false**: children are already counted in
  their parent's total, and letting them into the footer bills every transaction
  twice.
- **Drill state belongs to each visual**, as in Power BI — the matrix and the
  waterfall descend independently, and neither resets when the slicers change.
  The waterfall keeps one drill state *per axis*, so switching to Category and
  back does not dump the reader out of the year they were reading.

## See also
- [expense-tracker/](../README.md) · [lib/](../lib/README.md) · [components/common/](../../../components/common/README.md)
