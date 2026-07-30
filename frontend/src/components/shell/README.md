# frontend/src/components/shell/

## Purpose
OmniView's chrome — the frame around every app: the top header, the collapsible
app rail, the tab strip, the scroll-restoring viewport pane, the per-app subnav,
and the user menu.

## Role in OmniView
The `(shell)/layout.tsx` composes these into `Header / [AppRail | viewport
(TabBar + ViewportPane)]`. They read `lib/tabs.tsx` (which apps are open, in what
order) and `apps/registry.ts` (nav), and drive fullscreen on the viewport so tabs
survive it.

## Contents
| Item | What it does |
|------|--------------|
| `Header.tsx` | Top bar; the hamburger is the rail collapse toggle. |
| `AppRail.tsx` | Persistent narrow rail; active-app highlight; collapses to icons. |
| `TabBar.tsx` | Open-app tabs: close (×), drag-reorder, `Ctrl+Shift+←/→`. |
| `ViewportPane.tsx` | The scroll pane with per-tab scroll memory. |
| `AppSubnav.tsx` | The in-app tab strip (a single app's pages). |
| `UserMenu.tsx` | Profile popover: theme toggle, sign out (hidden under `sso_managed`). |

## Conventions & gotchas
- Backgrounded tabs unmount (App Router `children` is a live slot) — the rail/tab
  state and `ViewportPane` scroll memory, plus the resource cache, compensate.
- Rail collapse + open tabs persist to localStorage.

## See also
- [components/](../README.md) · [(shell) layout](<../../app/(shell)/README.md>) · [lib/tabs.tsx](../../lib/README.md)
