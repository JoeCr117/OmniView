# frontend/src/apps/expense-tracker/lib/

## Purpose
ExpenseTracker's typed API client and the app's pure helpers: date columns,
money formatting, slicer semantics, and the Breakdown page's arithmetic.

## Role in OmniView
Pages call these typed functions. `getAllDailyMetrics` + `DAILY_METRICS_KEY` are
the shared fetcher/key that let Check Book and Daily Trends fetch the daily
history once; `getBreakdown` + `BREAKDOWN_KEY` do the same for Breakdown.
`dates.ts` turns MM/DD/YYYY strings into sortable, `YYYY-MM-DD`-displayed columns
without mutating the CSV. `slicer.ts` and `money.ts` are shared by Check Book and
Breakdown, which is why they are modules rather than page locals.

## Contents
| Item | What it does |
|------|--------------|
| `api.ts` | Typed client (dailymetrics, breakdown, uncategorized, budgets, rawdata upload) + the two cache keys. |
| `dates.ts` | `dateColumnProps` — chronological sorter + display formatter for date columns. |
| `money.ts` | Accounting currency — ($781.64) — plus the Tabulator currency/total column presets. |
| `slicer.ts` | Power BI year/month slicer semantics: empty means all, click-to-clear, shift to extend. |
| `breakdown.ts` | Grouping, pivoting, waterfall running totals and pie shares — all pure. |
| `drill.ts` | Where a visual sits in its hierarchy: drill into (filters) vs. next level (does not). |
| `crossFilter.ts` | Click one visual, reduce the others: OR within a dimension, AND across them — and AND across visuals, so selections compose. |
| `breakdownView.ts` | Everything the Breakdown page is showing, as one value, plus the default Restart returns to. |
| `*.test.ts` | Cover each (upload is tested through the XHR path). |

## Conventions & gotchas
- Uploads go through `apiUpload` (progress), everything else through `apiFetch`.
- Keep endpoint strings here only.
- `breakdown.ts` is pure by design: the page recomputes on every slicer click and
  cross-filter selection, so the arithmetic must be cheap, and it is tested
  without a DOM, a fixture or a server.
- Dates are sliced (`date.slice(0, 4)`), never parsed — there is no date library
  here, and a `Date` would drag a timezone into a question that has none.
- **A `CrossFilter` is keyed by visual, not by one "source".** Each visual holds
  at most one selection and they intersect, which is what lets an account from
  the matrix and a year from the waterfall apply together. A visual is exempt
  from its *own* entry and no other, so composing never leaves one unable to
  show the whole.
- **Restart's enabled test and its reset are both derived from `INITIAL_VIEW`.**
  That is deliberate: the button used to check three pieces of state while eight
  more lived inside the visuals, so drilling never enabled it. A new piece of
  view state goes in `BreakdownView` and both behaviours pick it up, or it does
  not exist.

## See also
- [expense-tracker/](../README.md) · [lib/http.ts](../../../lib/README.md) · [lib/useResource.ts](../../../lib/README.md)
