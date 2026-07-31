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

No app is load-bearing for another, or for OmniView itself: apps share the shell
(auth, logging, chrome) and nothing else. They do not import each other, and the
shell reaches an app only through its declaration.

## Contents
| Item | What it does |
|------|--------------|
| `expense_tracker/` | Bank CSVs → budgets and balances. Owns four Django apps + a binding to the ExpenseTracker pipeline. |
| `omni_erd/` | Entity-relationship diagrams over live database catalogs. Read-only apart from saved layouts. |
| `admin_portal/` | The admin-only app: users/access, Databricks costs and jobs, API reference. |
| `__init__.py` | Marks the package (namespacing only). |

Each package's own README is the reference for that app's internals; nothing
here needs to know them.

## Conventions & gotchas
- Adding an app is a checklist, not an excavation — see the
  `adding-an-omniview-app` skill, or docs/ARCHITECTURE.md "Adding a new OmniView
  app". The backend half is: create `<app>/omniview_app.py` + `api.py`, then add
  one line to `shell/registry.py`.
- App labels are pinned in every AppConfig; packages may move, labels may not.
- App access is deny-by-default: non-staff users need an `AppAccess` grant, staff
  bypass. An app does not implement its own gating.
- An app that builds its own tables gets a pipeline under `pipelines/<app>/` and
  binds it in `<app>/pipeline.py` — the ETL never lives in this tree.

## See also
- [backend/](../README.md) · [shell/registry.py](../shell/README.md)
- [expense_tracker/](expense_tracker/README.md) · [omni_erd/](omni_erd/README.md) · [admin_portal/](admin_portal/README.md)
- [pipelines/](../../pipelines/README.md)
