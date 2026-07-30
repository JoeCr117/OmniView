# frontend/src/apps/omni-erd/

## Purpose
Omni-ERD's frontend code: the diagram canvas, the table node, the source picker,
and the pure functions that turn a `SchemaGraph` into something React Flow draws.

## Role in OmniView
Rendered by the routes under `src/app/(shell)/apps/omni-erd/`. Reads
`/api/omni-erd/*` and nothing else. Belongs to this app alone - eslint's
`import/no-restricted-paths` zone enforces that no other app reaches in.

## Contents
| Item | What it does |
|------|--------------|
| `lib/types.ts` | The wire shape, transcribed from `backend/apps/omni_erd/ir.py`. |
| `lib/api.ts` | The four endpoints, plus the `useResource` cache keys. |
| `lib/toFlow.ts` | `SchemaGraph` → React Flow `{nodes, edges}`. Pure; the one piece with real logic. |
| `lib/autoLayout.ts` | dagre placement, and `mergeLayout` which lets saved positions win. |
| `components/ErdCanvas.tsx` | The React Flow surface: grid, controls, minimap, drag persistence. |
| `components/LazyErdCanvas.tsx` | `next/dynamic` wrapper - React Flow stays out of the initial bundle. |
| `components/TableNode.tsx` | One table card, with a handle per column. |
| `components/SourcePicker.tsx` | Which (source, namespace) is on the canvas. |
| `components/DiagramView.tsx` | Composes the above; owns the two resources. |

## Conventions & gotchas
- **The canvas is [React Flow](https://reactflow.dev) (`@xyflow/react`, MIT),
  not a hand-rolled surface.** Pan, zoom, drag, selection, edge routing and the
  minimap are all its. What we own is where nodes start, what a node looks like,
  and when to save.
- **`nodeTypes` is defined at module scope**, never inline. React Flow warns
  loudly about a fresh object each render and remounts every node when it sees
  one.
- **The canvas needs a parent with a definite height.** The app layout is a flex
  column for exactly this reason - `ViewportPane` is `overflow-auto`, and a bare
  fragment would leave React Flow measuring zero. See
  `src/app/(shell)/apps/omni-erd/layout.tsx`.
- **`Background` colours are hardcoded per theme**, not read from CSS tokens: it
  paints into an SVG `<pattern>` fill, which cannot take a Tailwind class.
- **Layout saves are debounced and fire only on drag *end*.** A position change
  fires every animation frame while dragging; persisting those would be one PUT
  per frame.
- **Inferred edges render dashed with a confidence label.** A guess has to look
  like a guess - see `infer.py` on why `datavault` has no declared edges at all.
- Column type colouring keys off the *normalised* `base`, never `raw`, so the
  legend means the same thing for Postgres and Databricks.

## See also
- [apps/](../README.md) · [routes](../../app/(shell)/apps/omni-erd/README.md)
- [backend/apps/omni_erd/](../../../../backend/apps/omni_erd/README.md) - the IR is defined there
