# frontend/src/apps/omni-erd/

## Purpose
Omni-ERD's frontend code: the diagram canvas, the table node, the source picker,
the admin override editor, and the pure functions that turn a `SchemaGraph` into
something React Flow draws or a `SELECT` a user can run.

## Role in OmniView
Rendered by the two routes under `src/app/(shell)/apps/omni-erd/` - the diagram,
and the admin-only relationships editor. Reads `/api/omni-erd/*` and nothing else. Belongs to this app alone - eslint's
`import/no-restricted-paths` zone enforces that no other app reaches in.

## Contents
| Item | What it does |
|------|--------------|
| `lib/types.ts` | The wire shape, transcribed from `backend/apps/omni_erd/ir.py`. |
| `lib/api.ts` | Every endpoint - graph, layout, overrides - plus the `useResource` cache keys. |
| `lib/toFlow.ts` | `SchemaGraph` → React Flow `{nodes, edges}`. Pure; the one piece with real logic. |
| `lib/autoLayout.ts` | dagre placement, and `mergeLayout` which lets saved positions win. |
| `lib/buildSelect.ts` · `lib/dialect.ts` | The `SELECT` over a multi-selection, and the only dialect knowledge here. |
| `components/ErdCanvas.tsx` | The React Flow surface: grid, controls, minimap, drag persistence. |
| `components/LazyErdCanvas.tsx` | `next/dynamic` wrapper - React Flow stays out of the initial bundle. |
| `components/TableNode.tsx` | One table card, with a handle per column. |
| `components/SourcePicker.tsx` | Which (source, namespace) is on the canvas. |
| `components/DiagramView.tsx` | Composes the above; owns the two resources. |
| `components/Overrides*.tsx` | The relationships editor: list, inline form, pickers, status badge. |

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
- **`confidence < 1` is what makes an edge look like a guess** - dashed, labelled,
  tagged in the card - not `origin !== "declared"`. An admin override arrives at
  confidence 1.0 and must render solid: it is an assertion, not a guess. The
  predicate is the rule `ir.py` states; origin was only ever a proxy for it.
- Column type colouring keys off the *normalised* `base`, never `raw`, so the
  legend means the same thing for Postgres and Databricks.

## See also
- [apps/](../README.md) · [routes](../../app/(shell)/apps/omni-erd/README.md)
- [backend/apps/omni_erd/](../../../../backend/apps/omni_erd/README.md) - the IR is defined there
