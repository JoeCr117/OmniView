import type { SchemaGraph } from "./types";

/**
 * Per-column key role, so the card can print a "PK"/"FK" tag without re-scanning
 * the relationship list per row.
 *
 * Two sources feed it, in strict precedence:
 *  - **Declared constraints** carried on the column (`is_primary_key` /
 *    `is_foreign_key`). These are authoritative - the introspector reads them
 *    straight from `pg_constraint` - so they always win.
 *  - **Inferred relationships**, for schemas that declare no constraints at all.
 *    `datavault` is the whole reason this exists: dbt builds via CTAS, which
 *    carries no keys, so every `is_primary_key`/`is_foreign_key` there is false
 *    and the only signal is the `*SK` naming convention `infer.py` turns into
 *    edges. The *referenced* ("one") end of such an edge is the dimension's key
 *    (PK); the *referencing* ("many") end is a foreign key (FK).
 *
 * Declared edges are skipped here on purpose: the column flags already carry
 * their truth exactly, and reading a role off a declared edge would mislabel a
 * referenced *unique* (non-PK) column as a PK.
 */

export type KeyRole = "pk" | "fk";

export interface ColumnKey {
  role: KeyRole;
  /** True when the role was guessed from naming rather than declared. Drives the
   *  same "this is a guess" treatment the dashed edges already use. */
  inferred: boolean;
}

/** column name -> its key role. */
export type EntityKeyRoles = Map<string, ColumnKey>;

/**
 * Precedence as a single comparable number: declared beats inferred first, then
 * PK beats FK within each band. So declared PK > declared FK > inferred PK >
 * inferred FK - a declared foreign key is never overwritten by an inferred PK
 * guess.
 */
function rankOf(role: KeyRole, inferred: boolean): number {
  return (inferred ? 0 : 2) + (role === "pk" ? 1 : 0);
}

export function keyRolesByEntity(graph: SchemaGraph): Map<string, EntityKeyRoles> {
  const result = new Map<string, EntityKeyRoles>();

  const assign = (entityId: string, column: string, role: KeyRole, inferred: boolean) => {
    let roles = result.get(entityId);
    if (!roles) {
      roles = new Map<string, ColumnKey>();
      result.set(entityId, roles);
    }
    const existing = roles.get(column);
    if (!existing || rankOf(role, inferred) > rankOf(existing.role, existing.inferred)) {
      roles.set(column, { role, inferred });
    }
  };

  // Declared flags first - the authoritative band.
  for (const entity of graph.entities) {
    for (const column of entity.columns) {
      if (column.is_primary_key) assign(entity.id, column.name, "pk", false);
      else if (column.is_foreign_key) assign(entity.id, column.name, "fk", false);
    }
  }

  // Then inferred edges only: referenced end -> PK, referencing end -> FK.
  for (const relationship of graph.relationships) {
    if (relationship.origin === "declared") continue;
    for (const column of relationship.target.columns) {
      assign(relationship.target.entity, column, "pk", true);
    }
    for (const column of relationship.source.columns) {
      assign(relationship.source.entity, column, "fk", true);
    }
  }

  return result;
}
