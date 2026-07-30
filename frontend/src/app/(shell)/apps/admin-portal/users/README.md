# frontend/src/app/(shell)/apps/admin-portal/users/

## Purpose
The Users & Access tab: one row per user with per-app grant/revoke switches and
an Admin toggle, plus a debounced search.

## Role in OmniView
Rendered at `/apps/admin-portal/users`. The page is a thin wrapper around
`src/apps/admin-portal/components/UsersTable`, which reads `/api/admin-portal/users`
and writes grants/promotions (each toggle refetches the current page).

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | Mounts `UsersTable`. |

## Conventions & gotchas
- Search is debounced (300ms) so typing isn't one request per keystroke.
- Staff always have access (switches disabled); you cannot demote yourself.

## See also
- [admin-portal/](../README.md) · [UsersTable](../../../../../apps/admin-portal/components/README.md)
