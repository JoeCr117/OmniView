# frontend/src/app/(shell)/apps/omni-erd/diagram/

## Purpose
The ERD canvas page.

## Role in OmniView
Rendered at `/apps/omni-erd/diagram`, and the app's `basePath` - launching
Omni-ERD lands here. A three-line wrapper around `DiagramView`.

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | Renders `DiagramView` from `src/apps/omni-erd/components/`. |

## Conventions & gotchas
- The page is a server component; `DiagramView` and everything below it are
  `"use client"`. React Flow is client-only and lazy-loaded beneath that.
- No data fetching here. `DiagramView` owns the graph and layout resources.

## See also
- [omni-erd/](../README.md) · [DiagramView](../../../../../apps/omni-erd/components/README.md)
