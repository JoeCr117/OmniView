import dagre from "@dagrejs/dagre";

import { DEFAULT_VIEW_STATE, type ViewState, effectiveMode } from "./displayMode";
import { connectedColumnsByEntity, nodeSize } from "./toFlow";
import type { LayoutPositions, SchemaGraph } from "./types";

/**
 * Where the tables go before anyone has dragged them.
 *
 * A diagram that opens with every node stacked at the origin is useless, and
 * "arrange these boxes so the edges don't cross" is a solved problem - dagre
 * (MIT, ~40KB) solves it. Left-to-right, because a table is taller than it is
 * wide and LR keeps the aspect ratio of the whole diagram closer to a screen's.
 *
 * Only ever used to fill *gaps*: `mergeLayout` keeps every saved position and
 * computes the rest, so adding a table to a schema doesn't rearrange the
 * diagram you already laid out by hand.
 *
 * Takes the view state because card height depends on it. This is what makes
 * "collapse everything, then Reset View" genuinely compact rather than merely
 * shorter: dagre packs the boxes at the size they are *now*, not at the size
 * they would be fully expanded.
 */
export function autoLayout(graph: SchemaGraph, view: ViewState = DEFAULT_VIEW_STATE): LayoutPositions {
  const dag = new dagre.graphlib.Graph();
  dag.setDefaultEdgeLabel(() => ({}));
  dag.setGraph({ rankdir: "LR", nodesep: 36, ranksep: 140, marginx: 40, marginy: 40 });

  // The same connected-column map the nodes render from, so the sizes dagre
  // lays out with match the DOM it is laying out for.
  const connected = connectedColumnsByEntity(graph.relationships);
  for (const entity of graph.entities) {
    dag.setNode(
      entity.id,
      nodeSize(entity, connected.get(entity.id) ?? new Set(), effectiveMode(view, entity.id)),
    );
  }
  const known = new Set(graph.entities.map((entity) => entity.id));
  for (const relationship of graph.relationships) {
    // dagre invents a node for an unknown id, which would place a phantom box.
    if (known.has(relationship.source.entity) && known.has(relationship.target.entity)) {
      dag.setEdge(relationship.source.entity, relationship.target.entity);
    }
  }

  dagre.layout(dag);

  const positions: LayoutPositions = {};
  for (const entity of graph.entities) {
    const node = dag.node(entity.id);
    if (!node) continue;
    // dagre positions from the node's centre; React Flow from its top-left.
    positions[entity.id] = {
      x: node.x - node.width / 2,
      y: node.y - node.height / 2,
    };
  }
  return positions;
}

/**
 * Saved positions win; anything missing gets an auto-layout position.
 *
 * The case this exists for: a schema gains a table after you arranged the
 * diagram. Recomputing the whole layout would throw your arrangement away;
 * ignoring the new table would stack it at the origin.
 */
export function mergeLayout(
  graph: SchemaGraph,
  saved: LayoutPositions,
  view: ViewState = DEFAULT_VIEW_STATE,
): LayoutPositions {
  const known = new Set(graph.entities.map((entity) => entity.id));
  const missing = graph.entities.filter((entity) => !(entity.id in saved));
  if (missing.length === 0) {
    // Drop stale keys for entities that no longer exist, so they can't be
    // written back on the next save.
    return Object.fromEntries(Object.entries(saved).filter(([id]) => known.has(id)));
  }

  const computed = autoLayout(graph, view);
  const merged: LayoutPositions = {};
  for (const entity of graph.entities) {
    merged[entity.id] = saved[entity.id] ?? computed[entity.id] ?? { x: 0, y: 0 };
  }
  return merged;
}
