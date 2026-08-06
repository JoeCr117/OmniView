# frontend/src/apps/omni-erd/lib/

## Purpose
Omni-ERD's non-visual code: the wire types, the API calls, and the pure
transforms that stand between a `SchemaGraph` and either a drawn diagram or a
runnable `SELECT`.

## Role in OmniView
Everything here is deliberately free of React, which is what lets the interesting
parts (`toFlow`, `autoLayout`, `buildSelect`) be tested directly rather than
through a mounted canvas.

## Contents
| Item | What it does |
|------|--------------|
| `types.ts` | The dialect-agnostic schema document, transcribed from `ir.py`. |
| `api.ts` | Sources, graph, layout and the four override calls, plus cache keys. |
| `displayMode.ts` | The all/keys/none state machine, and what counts as a "key". |
| `entityDetail.ts` | One relation's columns, keys and in/out edges, for the flyout. |
| `keyRoles.ts` | Per-column PK/FK tag, from declared flags first and then from edges. |
| `focus.ts` | The 1-hop neighbourhood focus mode keeps on screen. |
| `searchIndex.ts` | Flat list of every table and column, for the search box. |
| `selection.ts` | `toggle` - the ordered Ctrl-click multi-selection. |
| `toFlow.ts` | Nodes and edges for React Flow, including per-column handle ids. |
| `autoLayout.ts` | dagre placement; `mergeLayout` keeps saved positions and fills gaps. |
| `dialect.ts` | `quoterFor` - the only place the frontend knows one engine from another. |
| `joinGraph.ts` | `joinColumns` - can these two join? - plus join groups and bridge suggestions. |
| `buildSelect.ts` | An ordered selection → `{sql, warnings, included, excluded, joinGroups, suggestedBridges}`. |
| `overrideDraft.ts` | The override form's state, its wire payload, and `draftProblem`'s rules. |
| `overrideText.ts` | `relationName` and `joinCondition` - an override as prose. |
| `*.test.ts` | Vitest specs, one per module. |

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
- **"Is this a guess?" is `confidence < 1`, never `origin !== "declared"`.**
  `toFlow`, `entityDetail` and `keyRoles` all use the same predicate, so the
  canvas and the card cannot disagree - and an admin override, which arrives at
  confidence 1.0, contributes authoritative roles and a solid edge.
- **`buildSelect` returns a structure, not a string.** A table nobody can join to
  would otherwise be silently absent from a statement that still looks complete;
  `warnings` / `excluded` are what stop that being a lie by omission.
- **The join predicate has exactly one home**, `joinGraph.ts::joinColumns`. Connectivity
  reporting and SQL generation ask it the same question, so the flyout cannot call a pair
  unrelated that the builder would join, nor suggest a bridge the builder then refuses -
  a relationship with mismatched or empty column arrays is drawn but unusable. `buildSelect`
  consumes `joinColumns` and no longer decides joinability itself.
- **`buildSelect` needs no override awareness.** The backend returns
  relationships most authoritative first, deduplicated by unordered pair, so
  "the first relationship joining this pair" already means "the override if
  there is one". Re-deriving that precedence here would be a second copy of a
  backend rule.
- **The first pick is always the `FROM`**, even when it is the isolated one. Pick
  order is the user's stated intent; a query that quietly re-roots itself onto a
  better-connected table is less predictable than one that reports what it left
  out.
- **Nothing here re-cases an identifier, ever.** `datavault` holds CamelCase
  relations with lowercase columns, so every catalog identifier is quoted
  verbatim in the spelling the graph reports. Only the `t1`..`tn` aliases are
  ours, and they stay unquoted.
- **`draftProblem` mirrors `services._require_valid_ends`**, rule for rule, and is
  the fast feedback rather than the authority - the form still shows whatever the
  server refuses. A rule added to one belongs in the other; a rule that lives only
  in the mounted form is a rule nobody tests.
- **`dialect.ts` is the whole of the frontend's engine knowledge**: ANSI double
  quotes, Databricks backticks, anything else falls back to ANSI. Total by
  construction, because `SourceInfo.dialect` is a plain string on the wire.

## See also
- [omni-erd/](../README.md) · [components/](../components/README.md)
