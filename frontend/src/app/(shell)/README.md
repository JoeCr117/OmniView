# frontend/src/app/(shell)/

## Purpose
The dashboard route group: everything shown after sign-in, inside the OmniView
chrome (header, app rail, tabbed viewport). Its layout is the shell; its child
routes are the launcher and each app's pages.

## Role in OmniView
A Next.js route group whose `layout.tsx` renders `Header / [AppRail | viewport
(TabBar + ViewportPane)]`. `page.tsx` is the launcher (home). App pages live
under `apps/<app-id>/<tab>/page.tsx`. The viewport — not the whole page — is the
fullscreen target, so tabs survive fullscreen.

## Contents
| Item | What it does |
|------|--------------|
| `apps/` | The app pages, one directory per app id. |
| `layout.tsx` | The shell layout (rail collapse state, tab bar, scroll-restoring viewport). |
| `page.tsx` | The launcher home (app grid, deny-by-default filtered). |
| `error.tsx` | Error boundary for the shell. |
| `layout.test.tsx` | Vitest coverage of the shell layout. |

## Conventions & gotchas
- Backgrounded app tabs **unmount** — App Router `children` is a live slot, not a
  cached tree (keep-alive by caching `children` was tried and does not work; see
  docs/ARCHITECTURE.md). The resource cache + remembered href + restored scroll
  compensate.

## See also
- [app/](../README.md) · [apps/](apps/README.md) · [components/shell/](../../components/shell/README.md) · [lib/tabs.tsx](../../lib/README.md)
