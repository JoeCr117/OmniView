# frontend/src/apps/omni-erd/lib/

## Purpose
Omni-ERD's non-visual code: the wire types, the API calls, and the two pure
transforms that stand between a `SchemaGraph` and a drawn diagram.

## Role in OmniView
Everything here is deliberately free of React, which is what lets the interesting
parts (`toFlow`, `autoLayout`) be tested directly rather than through a mounted
canvas.

## Contents
| Item | What it does |
|------|--------------|
| `types.ts` | The dialect-agnostic schema document, transcribed from `ir.py`. |
| `api.ts` | `fetchSources` / `fetchGraph` / `fetchLayout` / `saveLayout`, plus cache keys. |
| `displayMode.ts` | The all/keys/none state machine, and what counts as a "key". |
| `entityDetail.ts` | One relation's columns, keys and in/out edges, for the flyout. |
| `focus.ts` | The 1-hop neighbourhood focus mode keeps on screen. |
| `searchIndex.ts` | Flat list of every table and column, for the search box. |
| `toFlow.ts` | Nodes and edges for React Flow, including per-column handle ids. |
| `autoLayout.ts` | dagre placement; `mergeLayout` keeps saved positions and fills gaps. |
| `*.test.ts` | Vitest specs for all three transforms. |

## Conventions & gotchas
- **`types.ts` is a transcription, not a definition.** `backend/apps/omni_erd/ir.py`
  is the source of truth; if the two disagree, that file wins.
- **An edge with an endpoint that isn't on the canvas is dropped in `toFlow`.**
  React Flow renders nothing for a dangling edge and logs an error, so it has to
  be caught before it gets there.
- **A column handle id is only emitted when that column is rendered in the
  node's current mode**, otherwise the edge detaches and floats to the node's
  origin. When it isn't, `toEdges` falls back to the card-level handle.
- **"Key column" includes anything in a drawn relationship**, not just PK/FK.
  `datavault` declares no primary keys at all - dbt builds via CTAS, which
  carries no constraints - so the strict reading would empty all 22 of its cards
  in keys mode and detach all 17 inferred edges.
- **`autoLayout` takes the view state**, because card height depends on it. That
  is what makes "collapse everything, then Reset view" genuinely compact rather
  than merely shorter.
- **`fromWire` never trusts what it is given.** `view_state` is a JSONField and
  can hold a shape from an older build; a malformed preference must not stop the
  diagram rendering. Note it reads snake_case - the wire spelling - and the
  internal shape is camelCase.
- **`mergeLayout` never recomputes a saved position.** A schema gaining a table
  must not rearrange the diagram you already laid out; it also drops coordinates
  for entities that no longer exist, so they can't accumulate forever.
- dagre positions from a node's *centre*, React Flow from its *top-left* -
  `autoLayout` converts.

## See also
- [omni-erd/](../README.md) · [components/](../components/README.md)
