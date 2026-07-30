# frontend/src/app/(shell)/apps/expense-tracker/raw-csvs/

## Purpose
A read-only viewer of each account's raw bank-export CSVs (exactly as exported,
before parsing), plus an upload control with a real progress bar.

## Role in OmniView
Rendered at `/apps/expense-tracker/raw-csvs`. Reads `/rawdata/*`; uploads via
`apiUpload` (XHR) so the progress bar shows byte percentage, then flips to
"processing" while the server validates. Upload a CSV, then Rebuild to pick it up.

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | Account tabs + file selector + upload (`ProgressBar`) + auto-columned DataTable. |

## Conventions & gotchas
- Uploads go through `apiUpload`, not `apiFetch` — `fetch` can't report upload
  progress.
- Date-named columns get a real chronological sorter without mutating the CSV.

## See also
- [expense-tracker/](../README.md) · [lib/http.ts](../../../../../lib/README.md) · [backend rawdata](../../../../../../../backend/apps/expense_tracker/rawdata/README.md)
