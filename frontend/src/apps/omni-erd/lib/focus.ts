import type { SchemaGraph } from "./types";

/**
 * What stays visible when one relation is focused.
 *
 * One hop: the focused entity and whatever it is directly joined to. That is
 * what "connected to" means to anyone reading a diagram, and it is the only
 * depth that actually reduces anything here - `datavault` is a star, so the
 * transitive closure of any node is the entire schema.
 */

export interface Neighbourhood {
  /** Entities to keep on screen, including the focused one. */
  nodeIds: Set<string>;
  /** Edges to keep: those with *both* ends visible. */
  edgeIds: Set<string>;
}

export function neighbourhood(graph: SchemaGraph, entityId: string): Neighbourhood {
  const known = new Set(graph.entities.map((entity) => entity.id));
  const nodeIds = new Set<string>();
  if (known.has(entityId)) nodeIds.add(entityId);

  for (const relationship of graph.relationships) {
    const { source, target } = relationship;
    // An end that isn't on the canvas cannot be revealed by focusing, and
    // adding its id would make the "showing N of M" count lie.
    if (!known.has(source.entity) || !known.has(target.entity)) continue;
    if (source.entity === entityId) nodeIds.add(target.entity);
    if (target.entity === entityId) nodeIds.add(source.entity);
  }

  // Any edge between two survivors, not merely the ones touching the focus.
  // Hiding a relationship whose endpoints are both on screen would misrepresent
  // the diagram - the reader would see two tables and no line between them.
  const edgeIds = new Set<string>();
  for (const relationship of graph.relationships) {
    if (
      nodeIds.has(relationship.source.entity) &&
      nodeIds.has(relationship.target.entity)
    ) {
      edgeIds.add(relationship.id);
    }
  }

  return { nodeIds, edgeIds };
}
