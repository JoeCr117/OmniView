# backend/apps/admin_portal/

## Purpose
The admin-only dashboard app: managing per-app access grants and promoting
admins, plus read-only Databricks monitoring (costs from `system.billing.usage`,
and Jobs). It has no pipeline and no datavault models of its own.

## Role in OmniView
Declared to the shell via `omniview_app.py` (marked `admin_only`), mounted at
`/api/admin-portal/` behind `AdminAuth`. It owns the `AppAccess` grant table
(managed, in `omniview`) that the shell's `AppAccessAuth` enforces app-wide — so
this app is where deny-by-default access is *administered*, while the shell is
where it's *checked*.

## Contents
| Item | What it does |
|------|--------------|
| `omniview_app.py` | The app's declaration (admin_only, router, error hook). |
| `api.py` | `/users` (paginated grant/revoke/promote), `/overview`, `/costs/*`, `/jobs/*`. |
| `models.py` | `AppAccess` (managed) + `GRANTABLE_APP_IDS` (must track the registry). |
| `services.py` | Users query, cost aggregation, jobs overview (with per-user caches). |
| `databricks.py` | The on-behalf-of Databricks client (`x-forwarded-access-token`) + app-identity fallback. |
| `errors.py` | `DatabricksNotConnected` / `DatabricksForbidden` + the `register_errors(api)` hook. |
| `sql/` | File-based SQL for the SQL Statement Execution API. |
| `schemas.py` · `apps.py` | Response schemas + AppConfig (label pinned as `adminportal`). |
| `tests/` | Access, promotion, costs, jobs, enforcement. |

## Conventions & gotchas
- Databricks calls go on-behalf-of the signed-in user; Jobs falls back to the
  app's own identity if the workspace denies the scope (Free Edition reality).
- `GRANTABLE_APP_IDS` must stay in sync with `frontend/src/apps/registry.ts`
  (asserted by `shell/tests/test_registry.py`).

## See also
- [apps/](../README.md) · [shell/security.py](../../shell/README.md) · [sql/](sql/README.md) · [tests/](tests/README.md)
- `docs/DEPLOYMENT.md` "Admin Portal"
