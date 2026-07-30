# frontend/src/app/(shell)/apps/admin-portal/

## Purpose
The Admin Portal's route pages — one `page.tsx` per tab — plus the layout that
mounts its subnav and a client-side admin gate. Admin-only.

## Role in OmniView
Rendered under `/apps/admin-portal/*`. Django 404s these pages for signed-in
non-staff (defense in depth); the API is the real boundary. Each page is thin,
delegating to `src/apps/admin-portal/` components.

## Contents
| Item | What it does |
|------|--------------|
| `overview/` | The linked-KPI landing tab. |
| `users/` | Users & Access (grant/revoke, admin toggle). |
| `costs/` | Databricks DBU costs. |
| `jobs/` | Databricks Jobs. |
| `api-docs/` | The embedded OpenAPI/Swagger reference for the whole OmniView API. |
| `layout.tsx` | Mounts `AppSubnav` + the client `AdminGate`. |
| `page.tsx` | The portal index (redirects/defaults into a tab). |

## Conventions & gotchas
- All data fetching goes through `useResource` (skeleton on first load, no
  blanking on refetch).
- Databricks tabs render a "not connected"/"missing scope" card rather than an
  error when the workspace denies access.
- `api-docs/` is the exception to "delegates to `src/apps/admin-portal/`": it is
  a self-contained iframe of Django's Swagger UI with no components or fetches
  of its own.

## See also
- [apps/](../README.md) · [src/apps/admin-portal/](../../../../apps/admin-portal/README.md)
- [overview/](overview/README.md) · [users/](users/README.md) · [costs/](costs/README.md) · [jobs/](jobs/README.md) · [api-docs/](api-docs/README.md)
