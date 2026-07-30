# frontend/src/apps/omni-erd/components/

## Purpose
The diagram UI: the React Flow canvas, the card that represents a table, the
schema picker, and the view that composes them.

## Role in OmniView
Mounted by `src/app/(shell)/apps/omni-erd/diagram/page.tsx`. `DiagramView` owns
the data (two `useResource` subscriptions); everything else is presentational.

## Contents
| Item | What it does |
|------|--------------|
| `DiagramView.tsx` | Picks a source, fetches graph + layout, persists drags and view state. |
| `SourcePicker.tsx` | One button per (source, namespace); unconfigured sources show as such. |
| `ErdCanvas.tsx` | The React Flow surface - grid, controls, minimap, display state, saving. |
| `LazyErdCanvas.tsx` | `next/dynamic` wrapper so React Flow stays out of the initial bundle. |
| `TableNode.tsx` | One table: header, per-card mode toggle, and a row per visible column. |
| `DisplayControls.tsx` | Top-left popover: the three-state column control and Reset view. |
| `ModePills.tsx` | The segmented all/keys/none control, with a sliding indicator. |
| `DetailFlyout.tsx` | Right-hand inspector: one relation's columns, keys and edges. |
| `FocusBanner.tsx` | "showing N of M" status, and the way out of focus mode. |
| `SearchBar.tsx` | Top-centre combobox over every table and column name. |
| `actions.tsx` | Context carrying what a card may ask the canvas to do. |

## Conventions & gotchas
- **Every column renders both a source and a target handle**, hidden with
  `opacity-0` when unconnected rather than omitted. React Flow needs the element
  to exist before an edge can attach, and hiding rather than removing means
  nothing shifts when an edge appears.
- **Each card also renders a permanently-mounted node-level handle pair.**
  Collapsing a card unmounts its column handles, and an edge whose handle
  disappears strands itself at the node's origin; `toEdges` falls back to the
  card handles so a collapsed table gets a tidy box-to-box edge instead.
- **Changing which handles exist means calling `useUpdateNodeInternals`.** React
  Flow caches handle geometry at mount, and the collapse tween changes it on
  every frame - so `ErdCanvas` drives a short rAF loop, not a single call, or
  edges point at stale positions for the whole animation.
- **Callbacks reach cards through `actions.tsx`, never through `node.data`.**
  Node data is compared to decide whether to re-render, so a callback in it
  re-renders every card on every parent render; stabilising it with a ref means
  reading that ref during render, which the React compiler rejects.
- **Overlays must portal into `#app-viewport`** (`useOverlayContainer`). Radix
  defaults to `document.body`, which is invisible while the viewport is
  fullscreened - and fullscreen is the main way this app gets used.
- **`.erd-resetting` is applied for one transition only.** A standing
  `transition: transform` on `.react-flow__node` fights dragging.
- **The flyout is a React Flow `<Panel>`, not a Sheet.** It floats *inside* the
  canvas, so it reads as part of the diagram, needs no portal to survive
  fullscreen (it is already inside `#app-viewport`), and cannot be stranded
  mounted by an interrupted exit animation - a real bug when it was a Radix
  Sheet, which left a click-eating strip over the right of the canvas.
- **Its height is capped to clear the minimap.** The minimap is bottom-right and
  ~150px tall plus margin, so `MAX_HEIGHT` stops the panel above it. Move the
  minimap and that constant should move with it.
- **Every overlay is a `<Panel>`, and the corners are spoken for**: display
  top-left, search top-centre, details top-right, controls bottom-left, focus
  status bottom-centre, minimap bottom-right. Two panels at the same position
  overlap, so a new one needs either a free corner or to share an existing one.
- **The per-card toggle handles Enter/Space itself.** React Flow's node wrapper
  is focusable with its own key handling, and something in that chain cancels
  the browser's synthesised click - so without an explicit `onKeyDown` the
  control is mouse-only.
- **Focus fades before it hides.** Departing cards get `.erd-fading` for 180ms
  and only then React Flow's `hidden` flag; a test that counts nodes the instant
  the banner appears will still see all of them.
- **`onNodeClick` does not fire after a drag.** React Flow only raises it when
  the pointer stayed put, which is what lets one gesture both move a card and
  open its details without the two colliding.
- **The canvas is remounted on a source switch** (a `key` on `LazyErdCanvas`).
  React Flow holds node state internally; a fresh store is cheaper to reason
  about than reconciling one schema's nodes into another's.
- **`ssr: false` on the dynamic import is required, not preferred.** React Flow
  measures the DOM on mount, and this is a static export - there is no server
  render worth producing.
- **`nodesConnectable={false}`.** The diagram is a view: tables move, but nobody
  authors a foreign key by dragging. Handles exist for edge anchoring only.
- A failed layout save is swallowed on purpose - the positions are still on the
  canvas, only the memory of them is lost, and the next drag retries.

## See also
- [omni-erd/](../README.md) · [lib/](../lib/README.md)
