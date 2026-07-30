# frontend/src/app/(shell)/apps/expense-tracker/daily-trends/

## Purpose
Total balance over time: a labelled line chart (crosshair + cursor tooltip) above
a paginated table of the same daily data.

## Role in OmniView
Rendered at `/apps/expense-tracker/daily-trends`. Shares `DAILY_METRICS_KEY` with
Check Book (one fetch for both). The chart is `LazyTimeSeriesChart`, which thins
the series with LTTB so the crosshair lands on real days.

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | The balance chart (unit "USD") + the DataTable of daily rows. |

## Conventions & gotchas
- The chart downsamples internally (LTTB) — the page passes the full series; the
  table wants every row.
- First load shows `ChartSkeleton` + `TableSkeleton`.

## See also
- [expense-tracker/](../README.md) · [check-book/](../check-book/README.md) · [components/charts/](../../../../../components/charts/README.md)
