# frontend/src/apps/

## Purpose
The frontend half of the app system: the two registries that describe the apps,
and one subdirectory per app holding *only* that app's components and API client.

## Role in OmniView
`registry.ts` drives the launcher, rail, and subnav (icons, nav, basePath,
adminOnly); `access.ts` is the single deny-by-default visibility filter. Each
`<app-id>/` folder is that app's code and nothing else — enforced by eslint so
one app can't import another's internals.

## Contents
| Item | What it does |
|------|--------------|
| `registry.ts` | `APPS` + `appIdFromPath` / `getAppByPath` (id must match the backend registry). |
| `access.ts` | `visibleApps(user, config)` — open→all, signed-out→none, staff→all, else granted non-adminOnly. |
| `registry.test.ts` · `access.test.ts` | Cover both. |
| `admin-portal/` | The Admin Portal's frontend code. |
| `expense-tracker/` | ExpenseTracker's frontend code. |

## Conventions & gotchas
- Adding an app: add an `AppDefinition` here **and** register it on the backend;
  `shell/tests/test_registry.py` fails if the two disagree on ids.
- The registry filter is cosmetic — the API is the security boundary.

## See also
- [src/](../README.md) · [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)
- [admin-portal/](admin-portal/README.md) · [expense-tracker/](expense-tracker/README.md)
