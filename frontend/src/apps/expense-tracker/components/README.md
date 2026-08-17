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
| `BreakdownMatrix.tsx` | The Breakdown matrix: nets by date/label × account, plus the Power BI drill toolbar. |

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

## See also
- [expense-tracker/](../README.md) · [lib/](../lib/README.md) · [components/common/](../../../components/common/README.md)
