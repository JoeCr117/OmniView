# frontend/src/apps/omni-erd/components/

## Purpose
Omni-ERD's UI: the React Flow canvas and its cards, flyouts and pickers, plus
the admin-only relationship override editor.

## Role in OmniView
`DiagramView` is mounted by `diagram/page.tsx` and `OverridesView` by
`relationships/page.tsx`. Each owns its `useResource` subscriptions; everything
else here is presentational.

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
| `FlyoutPanel.tsx` | The frame both inspectors float in: header, scrolling body, footer. |
| `DetailFlyout.tsx` | Right-hand inspector: one relation's columns, keys and edges. |
| `SelectionFlyout.tsx` | The Ctrl-click multi-selection, and the `SELECT` that joins it. |
| `CopyButton.tsx` | Copy a text block, with the select-the-range fallback. |
| `FocusBanner.tsx` | "showing N of M" status, and the way out of focus mode. |
| `SearchBar.tsx` | Top-centre combobox over every table and column name. |
| `actions.tsx` | Context carrying what a card may ask the canvas to do. |
| `OverridesView.tsx` | The Relationships page: source picker, list, and the write path. |
| `OverridesTable.tsx` · `OverridesRow.tsx` | The list, and one row's names, join condition and actions. |
| `OverridesEditor.tsx` | The inline create/edit form; `lib/overrideDraft`'s `draftProblem` keeps Save disabled until valid. |
| `OverridesCombobox.tsx` · `OverridesColumnPairs.tsx` | Pick a name from the catalog; pair columns positionally. |
| `OverridesStatusBadge.tsx` · `OverridesDeleteButton.tsx` | Active/stale with the backend's own detail; delete asked twice. |

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
- **A flyout's `ariaLabel` is an E2E locator.** `frontend/e2e/omni-erd.spec.ts`
  finds both panels by accessible name - `Details for <table>` and
  `N table(s) selected` - so rewording either breaks the suite, not just a
  screen reader.
- **The generated SQL wraps, it never scrolls horizontally.** `FlyoutPanel` is
  `w-[19rem]` and a namespace-qualified JOIN line is far wider, so each SQL
  line renders as its own block with a hanging indent (`pre-wrap` plus a
  negative `text-indent`) rather than one `<pre>` with `overflow-x-auto` - the
  `ON` clause is the most valuable part of the query and must never sit behind
  a horizontal scrollbar.
- **The QUERY block lives in `FlyoutPanel`'s `footer`, not its scrolling body.**
  The table list is what should scroll when the selection is long; the query
  and its copy button must stay visible unconditionally, which only the
  non-scrolling footer slot guarantees.
- **`navigator.clipboard` is undefined outside a secure context** - plain http on
  a LAN address is a normal way to reach the dev container - so `CopyButton`
  falls back to selecting the text and says so in a live region. Do not reduce it
  to a bare `writeText`.
- **A disabled button that needs a hover tooltip uses `aria-disabled`, never the
  native `disabled` attribute.** `buttonVariants` sets `disabled:pointer-events-none`,
  which makes a `title` unreachable by the mouse; `CopyButton` stays focusable and
  hoverable and no-ops the click instead.
- **`FlyoutPanel` has two height modes via the `flexibleRegion` prop.** When set, that
  region absorbs spare height and scrolls internally; other regions are capped. The default
  height is capped to clear the minimap at bottom-right (~150px tall plus margin), controlled
  by `MAX_HEIGHT`; move the minimap and that constant should move with it.
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
