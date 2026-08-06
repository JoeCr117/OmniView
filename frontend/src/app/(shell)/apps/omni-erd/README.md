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
| `diagram/` | The ERD canvas, and the app's `basePath`. |
| `relationships/` | The admin-only relationship override editor. |
| `layout.tsx` | `AppSubnav` inside a flex column (see below). |
| `page.tsx` | The app index; the launcher normally deep-links past it. |

## Conventions & gotchas
- **This layout is a flex column, not a bare fragment - deliberately.**
  `ViewportPane` is `min-h-0 flex-1 overflow-auto`, and the other apps render
  `<AppSubnav>` and their page as siblings in a fragment. That leaves the page
  with no definite height, and React Flow measures its container on mount, so
  the canvas would render at zero. The column hands it the leftover height
  exactly - which also means the pane never scrolls, because the diagram pans
  instead. A page that needs to scroll must do it itself - `OverridesView` is a
  `flex h-full min-h-0 flex-col` whose body is `min-h-0 flex-1 overflow-y-auto`.
  Making the layout scroll instead would break the canvas.
- **The Relationships tab is hidden from non-staff by `AppNavItem.adminOnly`,
  which is cosmetic.** The boundary is `AdminAuth` on the
  `/api/omni-erd/admin/` endpoints.
- Folder name (`omni-erd`) is the app id - must match both registries.
- Fullscreen needs nothing here: `#app-viewport` is already the fullscreen
  target, so the canvas inherits it.

## See also
- [apps/](../README.md) · [src/apps/omni-erd/](../../../../apps/omni-erd/README.md)
- [diagram/](diagram/README.md) · [relationships/](relationships/README.md)
