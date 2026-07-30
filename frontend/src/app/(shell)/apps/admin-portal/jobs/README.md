# frontend/src/app/(shell)/apps/admin-portal/jobs/

## Purpose
The Jobs tab: KPI counts plus running/failed/completed run tables, each row deep
-linking to the Databricks workspace.

## Role in OmniView
Rendered at `/apps/admin-portal/jobs`. Reads `/api/admin-portal/jobs/overview`
via `useResource`. On this Free-Edition workspace there are zero jobs, so empty
tables + zero KPIs is the *correct* result, not an error.

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | KPI cards + three `RunsTable`s with new-tab deep links. |

## Conventions & gotchas
- Distinguishes "not connected"/"missing scope" (a `NotConnectedCard`) from a
  real error via `describeDatabricksError`.

## See also
- [admin-portal/](../README.md) · [NotConnectedCard](../../../../../apps/admin-portal/components/README.md)
