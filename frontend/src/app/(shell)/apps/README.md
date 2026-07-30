# frontend/src/app/(shell)/apps/

## Purpose
The route directories for each dashboard app — one folder per app id, each a thin
wrapper mapping URLs to that app's pages. The app's actual components live under
`src/apps/<id>/`.

## Role in OmniView
URLs are `/apps/<app-id>/<tab>`. Each app folder has a `layout.tsx` (its subnav /
access gate) and one `page.tsx` per tab. These emit the exported `.html` files
Django serves and gates.

## Contents
| Item | What it does |
|------|--------------|
| `admin-portal/` | The Admin Portal's route pages (overview, users, costs, jobs). |
| `expense-tracker/` | The ExpenseTracker route pages (check-book, daily-trends, budget-map, …). |

## Conventions & gotchas
- Folder name = app id, and must match `src/apps/registry.ts` and the backend
  registry (asserted by a test).
- Pages stay thin — they compose components from `src/apps/<id>/` and
  `components/`.

## See also
- [(shell)/](../README.md) · [src/apps/](../../../apps/README.md) · [src/apps/registry.ts](../../../apps/README.md)
