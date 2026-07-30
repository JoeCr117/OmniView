# frontend/src/apps/admin-portal/components/

## Purpose
The Admin Portal's own React components — the ones specific enough that no other
app needs them.

## Role in OmniView
Mounted by the portal's route pages. `UsersTable` is the Users & Access dashboard;
`AdminGate` client-guards the portal for non-staff; `NotConnectedCard` renders the
Databricks 503/403 taxonomy distinctly.

## Contents
| Item | What it does |
|------|--------------|
| `UsersTable.tsx` | KPI cards + per-user grant/revoke/admin switches + debounced search. |
| `AdminGate.tsx` | Client-side redirect for non-staff (defense in depth; the API is the boundary). |
| `NotConnectedCard.tsx` | Renders + classifies Databricks not-connected / missing-scope errors. |

## Conventions & gotchas
- `UsersTable` fetches via `useResource` and writes optimistically (refetch on
  success, error banner on failure).
- If a component here becomes useful to another app, promote it to
  `components/common` — don't import across apps.

## See also
- [admin-portal/](../README.md) · [components/common/](../../../components/common/README.md)
