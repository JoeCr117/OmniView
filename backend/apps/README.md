# backend/apps/

## Purpose
Holds one self-contained package per OmniView dashboard app. Each package owns
its Django apps, its django-ninja routers, its services, and its tests, and
declares itself to the shell through a single `omniview_app.py`.

## Role in OmniView
This is the "one package per app" half of the structure. The shell
(`shell/registry.py`) lists these packages; each package's `omniview_app.py`
(shape in `shell/appspec.py`) is the single declaration that drives
`INSTALLED_APPS`, the `/api/<id>/` mount and its auth, datavault DB routing, the
grantable-app list, and legacy redirects. An app never edits the shell; the
shell never names an app.

## Contents
| Item | What it does |
|------|--------------|
| `expense_tracker/` | The first app: bank CSVs → budgets and balances. Owns four Django apps + a pipeline binding. |
| `admin_portal/` | The admin-only app: users/access, Databricks costs and jobs. |
| `__init__.py` | Marks the package (namespacing only). |

## Conventions & gotchas
- Adding an app is a checklist, not an excavation — see docs/ARCHITECTURE.md "Adding
  a new OmniView app". The backend half is: create `<app>/omniview_app.py` +
  `api.py`, then add one line to `shell/registry.py`.
- App labels are pinned in every AppConfig; packages may move, labels may not.

## See also
- [backend/](../README.md) · [shell/registry.py](../shell/README.md)
- [expense_tracker/](expense_tracker/README.md) · [admin_portal/](admin_portal/README.md)
