# frontend/src/app/(shell)/apps/omni-erd/

## Purpose
Omni-ERD's route pages, plus the layout that mounts its subnav and gives the
canvas a height.

## Role in OmniView
Rendered under `/apps/omni-erd/*`. Thin wrappers; the real components live in
`src/apps/omni-erd/`.

## Contents
| Item | What it does |
|------|--------------|
| `diagram/` | The ERD canvas - the app's only real page. |
| `layout.tsx` | `AppSubnav` inside a flex column (see below). |
| `page.tsx` | The app index; the launcher normally deep-links past it. |

## Conventions & gotchas
- **This layout is a flex column, not a bare fragment - deliberately.**
  `ViewportPane` is `min-h-0 flex-1 overflow-auto`, and the other apps render
  `<AppSubnav>` and their page as siblings in a fragment. That leaves the page
  with no definite height, and React Flow measures its container on mount, so
  the canvas would render at zero. The column hands it the leftover height
  exactly - which also means the pane never scrolls, because the diagram pans
  instead.
- Folder name (`omni-erd`) is the app id - must match both registries.
- Fullscreen needs nothing here: `#app-viewport` is already the fullscreen
  target, so the canvas inherits it.

## See also
- [apps/](../README.md) · [src/apps/omni-erd/](../../../../apps/omni-erd/README.md)
- [diagram/](diagram/README.md)
