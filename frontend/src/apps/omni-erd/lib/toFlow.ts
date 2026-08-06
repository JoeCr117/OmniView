import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";

import { type ColumnMode, type ViewState, effectiveMode, isKeyColumn } from "./displayMode";
import { type EntityKeyRoles, keyRolesByEntity } from "./keyRoles";
import type { Column, Entity, Relationship, SchemaGraph } from "./types";

/**
 * `SchemaGraph` + `ViewState` -> the `{nodes, edges}` React Flow draws.
 *
 * Deliberately pure and free of React: this is the one piece of the canvas with
 * real logic in it, so keeping it a function of its inputs is what makes it
 * testable without mounting anything.
 *
 * Three rules it enforces, all of which are silent failures otherwise:
 *  - an edge whose endpoint is not in `entities` is dropped, because React Flow
 *    renders nothing for it and logs an error;
 *  - a column handle id is only emitted when that column is actually rendered
 *    *in the node's current mode*, otherwise the edge detaches and floats to the
 *    node's origin;
 *  - when it isn't, the edge falls back to the node-level handle instead, so
 *    collapsing a card degrades an edge to box-to-box rather than breaking it.
 */

export interface TableNodeData extends Record<string, unknown> {
  entity: Entity;
  /** Columns participating in any drawn relationship, so the node can mark
   *  them without re-scanning the edge list per row. */
  connectedColumns: Set<string>;
  /** column name -> its PK/FK role, so a row can print a key tag without
   *  re-deriving it. Empty for entities with no key columns. */
  keyRoles: EntityKeyRoles;
  /** Resolved default-or-override mode. Lives in `data` so React Flow re-renders
   *  the card when it changes.
   *
   *  Note what is deliberately *not* here: the toggle callback. Node data is
   *  compared to decide whether to re-render a card, so a callback in it either
   *  re-renders every card on every parent render or has to be stabilised with a
   *  ref read during render, which the React compiler rejects. It comes from
   *  `components/actions.tsx` instead. */
  mode: ColumnMode;
}

export type TableNode = Node<TableNodeData, "erdTable">;

/** Handle ids are per column, so an edge attaches to the right *row* of the
 *  table rather than to the box. `side` keeps the two ends distinct - React Flow
 *  requires a source handle and a target handle to be separate elements. */
export function handleId(column: string, side: "source" | "target"): string {
  return `${side}:${column}`;
}

/**
 * The always-mounted, card-level fallback handles.
 *
 * Every card renders this pair regardless of mode. Without them, collapsing a
 * card would unmount the handle an edge is anchored to and React Flow would
 * strand that edge at the node's origin - which looks like a rendering bug, not
 * like a collapsed table.
 */
export const NODE_HANDLE = { source: "node:source", target: "node:target" } as const;

const EMPTY: ReadonlySet<string> = new Set();

/**
 * Which columns a card renders in a given mode, and how many it hid.
 *
 * `all` means all - there is no count cap. The compact view is `keys`, which
 * collapses on meaning rather than on an arbitrary row limit.
 */
export function visibleColumns(
  entity: Entity,
  connected: ReadonlySet<string>,
  mode: ColumnMode,
): { shown: Column[]; hidden: number } {
  if (mode === "none") return { shown: [], hidden: entity.columns.length };
  if (mode === "all") return { shown: entity.columns, hidden: 0 };
  const shown = entity.columns.filter((column) => isKeyColumn(column, connected));
  return { shown, hidden: entity.columns.length - shown.length };
}

export function connectedColumnsByEntity(relationships: Relationship[]): Map<string, Set<string>> {
  const connected = new Map<string, Set<string>>();
  const add = (entityId: string, columns: string[]) => {
    const set = connected.get(entityId) ?? new Set<string>();
    columns.forEach((column) => set.add(column));
    connected.set(entityId, set);
  };
  for (const relationship of relationships) {
    add(relationship.source.entity, relationship.source.columns);
    add(relationship.target.entity, relationship.target.columns);
  }
  return connected;
}

/**
 * What each card is currently drawing, computed once and shared.
 *
 * `toNodes`, `toEdges` and `autoLayout` all need the same answer, and computing
 * it three times is how they drift apart - an edge anchored to a column the node
 * decided not to render is exactly the bug this file exists to prevent.
 */
export function renderPlan(graph: SchemaGraph, view: ViewState) {
  const connected = connectedColumnsByEntity(graph.relationships);
  const rendered = new Map<string, Set<string>>();
  for (const entity of graph.entities) {
    const mode = effectiveMode(view, entity.id);
    const { shown } = visibleColumns(entity, connected.get(entity.id) ?? EMPTY, mode);
    rendered.set(entity.id, new Set(shown.map((column) => column.name)));
  }
  return { connected, rendered };
}

export function toNodes(
  graph: SchemaGraph,
  positions: Record<string, { x: number; y: number }>,
  view: ViewState,
): TableNode[] {
  const connected = connectedColumnsByEntity(graph.relationships);
  const keyRoles = keyRolesByEntity(graph);
  return graph.entities.map<TableNode>((entity) => ({
    id: entity.id,
    type: "erdTable",
    position: positions[entity.id] ?? { x: 0, y: 0 },
    data: {
      entity,
      connectedColumns: connected.get(entity.id) ?? new Set(),
      keyRoles: keyRoles.get(entity.id) ?? new Map(),
      mode: effectiveMode(view, entity.id),
    },
  }));
}

/**
 * What an edge says about itself, if anything.
 *
 * A guess prints how sure it is. An admin override is certain, so it carries no
 * percentage, but it is a human's assertion rather than a catalog fact and
 * saying so is the only thing that distinguishes the two on the canvas. A
 * declared constraint speaks for itself and stays unlabelled.
 */
function edgeLabel(relationship: Relationship): string | undefined {
  if (relationship.confidence < 1) return `${Math.round(relationship.confidence * 100)}%`;
  return relationship.origin === "admin_override" ? "override" : undefined;
}

export function toEdges(graph: SchemaGraph, view: ViewState): Edge[] {
  const { rendered } = renderPlan(graph, view);

  const edges: Edge[] = [];
  for (const relationship of graph.relationships) {
    const sourceRendered = rendered.get(relationship.source.entity);
    const targetRendered = rendered.get(relationship.target.entity);
    // Both endpoints must be on the canvas. The backend already drops
    // cross-namespace edges; this also covers a graph filtered client-side.
    if (!sourceRendered || !targetRendered) continue;

    const sourceColumn = relationship.source.columns[0];
    const targetColumn = relationship.target.columns[0];
    const guessed = relationship.confidence < 1;

    edges.push({
      id: relationship.id,
      source: relationship.source.entity,
      target: relationship.target.entity,
      // Anchor to the column row when it is actually drawn, otherwise to the
      // card itself. Never to a handle that is not mounted.
      sourceHandle: sourceRendered.has(sourceColumn)
        ? handleId(sourceColumn, "source")
        : NODE_HANDLE.source,
      targetHandle: targetRendered.has(targetColumn)
        ? handleId(targetColumn, "target")
        : NODE_HANDLE.target,
      type: "smoothstep",
      animated: false,
      // A guess has to look like a guess.
      style: guessed
        ? { strokeDasharray: "6 4", strokeWidth: 1.5 }
        : { strokeWidth: 1.75 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      label: edgeLabel(relationship),
      labelShowBg: true,
      data: {
        origin: relationship.origin,
        note: relationship.note,
        confidence: relationship.confidence,
      },
    });
  }
  return edges;
}

/** Card geometry. Kept here because `nodeSize` and `TableNode` must agree, and
 *  dagre needs the answer before anything has rendered. */
export const CARD = { width: 260, header: 40, row: 24, padding: 10 } as const;

/**
 * Node height, which dagre needs before anything has rendered.
 *
 * Must agree with what `TableNode` actually draws - so it counts the rows for
 * *this mode* and adds one for the "+N more" line when there is one. A size that
 * disagrees with the DOM makes dagre overlap or over-space the nodes.
 */
export function nodeSize(
  entity: Entity,
  connected: ReadonlySet<string> = EMPTY,
  mode: ColumnMode = "all",
) {
  const { shown, hidden } = visibleColumns(entity, connected, mode);
  // "none" is a bare header: no rows, and no summary line to count either.
  const rows = mode === "none" ? 0 : shown.length + (hidden > 0 ? 1 : 0);
  return {
    width: CARD.width,
    height: CARD.header + rows * CARD.row + CARD.padding,
  };
}
