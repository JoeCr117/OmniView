---
name: adding-an-omniview-app
description: Add a new dashboard app to the OmniView shell — backend package and registry entry, plus the frontend AppDefinition and routes. Use when creating a new app alongside ExpenseTracker, Omni-ERD and the Admin Portal.
---

# Adding a new app to the dashboard

**Backend.** Create `backend/apps/<app>/` with an `omniview_app.py` declaring an `OmniViewApp`
(see `backend/shell/appspec.py` for the fields) and an `api.py` exposing a `router`, then add it to
`OMNIVIEW_APPS` in `backend/shell/registry.py`.

That single registration is what drives `INSTALLED_APPS`, the `/api/<id>/` mount and its auth,
datavault DB routing, the grantable-app list the Admin Portal offers, and any legacy redirects —
they were four separate hand-maintained lists before, and nothing kept them in agreement.

**Frontend.** Add an `AppDefinition` to `frontend/src/apps/registry.ts` (drives launcher, sidebar
and subnav), create routes under `frontend/src/app/(shell)/apps/<id>/`, and app code under
`src/apps/<id>/`.

`shell/tests/test_registry.py` fails if the two registries disagree on app ids.

App access is deny-by-default: non-staff users need an `AppAccess` grant (managed in the Admin
Portal); staff bypass and see everything.

`docs/ARCHITECTURE.md` is the full structure contract and carries the complete checklist — read it
before moving code between packages.
