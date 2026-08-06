# frontend/src/app/(shell)/apps/omni-erd/relationships/

## Purpose
The admin-only relationship override editor.

## Role in OmniView
Rendered at `/apps/omni-erd/relationships`, the second Omni-ERD subnav tab. A
wrapper that puts `OverridesView` behind `AdminGate`.

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | `AdminGate` around `OverridesView` from `src/apps/omni-erd/components/`. |

## Conventions & gotchas
- **This page owns its own scrolling** (`OverridesView` is a flex column whose
  body is `min-h-0 flex-1 overflow-y-auto`). The Omni-ERD layout deliberately
  does *not* scroll — it hands the canvas a definite height so React Flow can
  measure it — so a long list here would be clipped if the page did not scroll
  itself. Do not make the layout scrollable to fix that; it would break the
  canvas.
- `AdminGate` is cosmetic. The boundary is `admin_api.py`'s
  `Router(auth=AdminAuth())`; the nav item is merely hidden for non-staff. There
  is deliberately no Django page-level 404 for this prefix, unlike
  `apps/admin-portal` (see `config/frontend.py`).
- Writes invalidate the *graph* cache key the Diagram tab reads, not just the
  override list. Django's own graph cache is per process, so the copy behind
  another gunicorn worker can lag by up to `GRAPH_CACHE_TTL_SECONDS` — the UI
  copy says so and must not promise otherwise.

## See also
- [omni-erd/](../README.md) · [diagram/](../diagram/README.md)
- [src/apps/omni-erd/components/](../../../../../apps/omni-erd/components/README.md)
