# frontend/src/apps/expense-tracker/

## Purpose
ExpenseTracker's frontend code: its typed API client and app-specific helpers.
Nothing here is imported by any other app.

## Role in OmniView
The route pages under `app/(shell)/apps/expense-tracker/` are thin wrappers over
this code. `lib/api.ts` is the only place that names `/api/expense-tracker/*`
(and defines `DAILY_METRICS_KEY`, the shared cache key).

## Contents
| Item | What it does |
|------|--------------|
| `lib/` | `api.ts` (typed client + cache keys), `dates.ts`, `money.ts`, `slicer.ts` and `breakdown.ts`. |

## Conventions & gotchas
- May not import from `apps/admin-portal/*` (eslint-enforced).
- Most of its UI is composed from `components/common` + `components/charts`, not
  local one-offs.

## See also
- [apps/](../README.md) · [lib/](lib/README.md)
