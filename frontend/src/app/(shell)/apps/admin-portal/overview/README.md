# frontend/src/app/(shell)/apps/admin-portal/overview/

## Purpose
The Admin Portal landing tab: a grid of linked KPI cards (users, admins,
running/failed jobs, 30-day DBUs) that deep-link into the other tabs.

## Role in OmniView
Rendered at `/apps/admin-portal/overview`. Reads `GET /api/admin-portal/overview`
via `useResource`; the endpoint always 200s and degrades Databricks KPIs to null
with a "not connected" caption when the workspace is unreachable.

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | The KPI grid (skeleton on first load, RefreshBar on refetch). |

## Conventions & gotchas
- Uses `KpiCard` from `components/common` (not a local copy — the four old copies
  were deduped there).

## See also
- [admin-portal/](../README.md) · [components/common/](../../../../../components/common/README.md)
