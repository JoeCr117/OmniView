import { isKeyColumn } from "./displayMode";
import { connectedColumnsByEntity } from "./toFlow";
import type { Column, Entity, RelationshipOrigin, SchemaGraph } from "./types";

/**
 * Everything the detail panel shows about one relation, derived once.
 *
 * Pure and React-free for the same reason `toFlow` is: this is where the
 * fiddly cases live (dangling ends, self-references, an entity that isn't in
 * the graph at all), and they are far easier to pin down in a unit test than
 * through a mounted flyout.
 */

export interface RelatedEntity {
  relationshipId: string;
  /** The entity at the *other* end. */
  entityId: string;
  entityName: string;
  /** Columns on the entity being described. */
  localColumns: string[];
  /** Columns on the other entity. */
  remoteColumns: string[];
  origin: RelationshipOrigin;
  confidence: number;
  note: string | null;
  /** A relation that points at itself - a parent_id on a tree table, say. */
  selfReference: boolean;
}

export interface EntityDetail {
  entity: Entity;
  columnCount: number;
  /** Columns that earn a place in `keys` mode, in catalog order. */
  keyColumns: Column[];
  nullableCount: number;
  /** This entity's foreign keys pointing outward (it is the "many" side). */
  references: RelatedEntity[];
  /** Relations pointing *at* this entity (it is the "one" side). */
  referencedBy: RelatedEntity[];
  /** Distinct neighbouring entities, ignoring direction and self-edges. This is
   *  exactly what M3's Focus will hide down to, so the panel can say up front
   *  how much focusing would leave. */
  neighbourIds: string[];
}

export function entityDetail(graph: SchemaGraph, entityId: string): EntityDetail | null {
  const entity = graph.entities.find((candidate) => candidate.id === entityId);
  if (!entity) return null;

  const names = new Map(graph.entities.map((e) => [e.id, e.name]));
  const connected = connectedColumnsByEntity(graph.relationships).get(entityId) ?? new Set<string>();

  const references: RelatedEntity[] = [];
  const referencedBy: RelatedEntity[] = [];
  const neighbours = new Set<string>();

  for (const relationship of graph.relationships) {
    const { source, target } = relationship;
    const outgoing = source.entity === entityId;
    const incoming = target.entity === entityId;
    if (!outgoing && !incoming) continue;

    const selfReference = outgoing && incoming;
    // The end that is not this entity - or this entity again, for a self-edge.
    const otherId = outgoing ? target.entity : source.entity;
    const otherName = names.get(otherId);
    // Drop an end that isn't on the canvas. The backend already filters
    // cross-namespace edges; this covers a graph narrowed client-side, and
    // saves the panel from rendering a link to nothing.
    if (otherName === undefined) continue;

    const related: RelatedEntity = {
      relationshipId: relationship.id,
      entityId: otherId,
      entityName: otherName,
      localColumns: outgoing ? source.columns : target.columns,
      remoteColumns: outgoing ? target.columns : source.columns,
      origin: relationship.origin,
      confidence: relationship.confidence,
      note: relationship.note,
      selfReference,
    };

    // A self-edge is listed once, as an outgoing reference. Showing it in both
    // lists would read as two different relationships.
    if (outgoing) references.push(related);
    else referencedBy.push(related);

    if (!selfReference) neighbours.add(otherId);
  }

  return {
    entity,
    columnCount: entity.columns.length,
    keyColumns: entity.columns.filter((column) => isKeyColumn(column, connected)),
    nullableCount: entity.columns.filter((column) => column.nullable).length,
    references,
    referencedBy,
    neighbourIds: [...neighbours],
  };
}

/** How an inferred edge's confidence reads in the panel. Anything at full
 *  confidence - a declared constraint, or an admin override - has none worth
 *  showing: it is an assertion, not a guess. */
export function confidenceLabel(related: RelatedEntity): string | null {
  if (related.confidence >= 1) return null;
  return `${Math.round(related.confidence * 100)}% confident`;
}
