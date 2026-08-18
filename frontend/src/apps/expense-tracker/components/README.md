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
| `BreakdownPie.tsx` | Expenses by category, drilling Category → SubCategory → Label. |

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
- **The three Breakdown visuals are controlled**: drill position, drill mode and
  the matrix's expand-all all live on the page as one `BreakdownView`. They still
  descend independently and none resets when the slicers change — the waterfall
  still keeps one drill state *per axis* — but the page can now see and clear
  them, which is the only way Restart can work. Keeping them in each component's
  `useState` is what made drilling invisible to that button.
- **The matrix cross-filters from its account column header, on Ctrl/⌘+click.**
  Rows drill and expand; they no longer cross-filter. A plain header click is
  already spent on sorting, so the grid sets `headerSortClickElement: "icon"` to
  move sorting onto the arrow — without it one Ctrl+click both filters and
  re-sorts, and the re-sort is what the reader notices.

## See also
- [expense-tracker/](../README.md) · [lib/](../lib/README.md) · [components/common/](../../../components/common/README.md)
