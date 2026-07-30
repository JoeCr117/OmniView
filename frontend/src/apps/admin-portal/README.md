# frontend/src/apps/admin-portal/

## Purpose
The Admin Portal app's frontend code: its components and its typed API client.
Nothing here is imported by any other app.

## Role in OmniView
The route pages under `app/(shell)/apps/admin-portal/` are thin wrappers around
these components. `lib/api.ts` is the only place that names
`/api/admin-portal/*`.

## Contents
| Item | What it does |
|------|--------------|
| `components/` | `UsersTable`, `AdminGate`, `NotConnectedCard`. |
| `lib/` | `api.ts` — the typed client for the portal's endpoints. |

## Conventions & gotchas
- May not import from `apps/expense-tracker/*` (eslint-enforced). Shared UI lives
  in `components/common`.

## See also
- [apps/](../README.md) · [components/](components/README.md) · [lib/](lib/README.md)
