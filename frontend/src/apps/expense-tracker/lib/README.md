# frontend/src/apps/expense-tracker/lib/

## Purpose
ExpenseTracker's typed API client and its date helpers. One place names the
`/api/expense-tracker/*` routes; another gives Tabulator real chronological
sorting for bank-export date columns.

## Role in OmniView
Pages call these typed functions. `getAllDailyMetrics` + `DAILY_METRICS_KEY` are
the shared fetcher/key that let Check Book and Daily Trends fetch the daily
history once. `dates.ts` turns MM/DD/YYYY strings into sortable, `YYYY-MM-DD`
-displayed columns without mutating the CSV.

## Contents
| Item | What it does |
|------|--------------|
| `api.ts` | Typed client (dailymetrics, uncategorized, budgets, rawdata upload) + `DAILY_METRICS_KEY`. |
| `dates.ts` | `dateColumnProps` — chronological sorter + display formatter for date columns. |
| `api.test.ts` · `dates.test.ts` | Cover both (upload is tested through the XHR path). |

## Conventions & gotchas
- Uploads go through `apiUpload` (progress), everything else through `apiFetch`.
- Keep endpoint strings here only.

## See also
- [expense-tracker/](../README.md) · [lib/http.ts](../../../lib/README.md) · [lib/useResource.ts](../../../lib/README.md)
