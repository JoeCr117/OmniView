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
| `ViewportPane.tsx` | The scroll pane with per-tab scroll memory; a flex column, so a page can fill it. |
| `AppSubnav.tsx` | The in-app tab strip (a single app's pages). |
| `UserMenu.tsx` | Profile popover: theme toggle, sign out (hidden under `sso_managed`). |

## Conventions & gotchas
- Backgrounded tabs unmount (App Router `children` is a live slot) — the rail/tab
  state and `ViewportPane` scroll memory, plus the resource cache, compensate.
- Rail collapse + open tabs persist to localStorage.
- **`ViewportPane` is a flex column.** A page that wants to fill the pane exactly
  rather than scroll says `flex-1` and gets the height left over after the app's
  subnav, without hardcoding that subnav's height (Breakdown does this). Pages
  that don't ask stay content-sized — a flex item never shrinks below its
  content here — and the subnav is `shrink-0` because chrome never gives up
  height to the page below it.

## See also
- [components/](../README.md) · [(shell) layout](<../../app/(shell)/README.md>) · [lib/tabs.tsx](../../lib/README.md)
