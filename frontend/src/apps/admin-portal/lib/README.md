# frontend/src/apps/admin-portal/lib/

## Purpose
The Admin Portal's typed API client — the single place that names the
`/api/admin-portal/*` routes and shapes their responses.

## Role in OmniView
The portal's components call these functions (never `apiFetch` directly), so
endpoint paths and response types live in one file. Transport concerns (creds,
CSRF, 401) stay in the shared `lib/http.ts`.

## Contents
| Item | What it does |
|------|--------------|
| `api.ts` | `getUsers`/`grantApp`/`revokeApp`/`setAdmin`, `getPortalOverview`, `getCostsOverview`, `getJobsOverview` + their types. |

## Conventions & gotchas
- Keep endpoint strings here only; components import the typed functions.

## See also
- [admin-portal/](../README.md) · [lib/http.ts](../../../lib/README.md)
