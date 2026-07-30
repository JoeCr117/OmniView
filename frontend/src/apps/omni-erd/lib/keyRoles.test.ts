import { describe, expect, it } from "vitest";

import { keyRolesByEntity } from "./keyRoles";
import type { Column, Entity, Relationship, SchemaGraph } from "./types";

function column(name: string, overrides: Partial<Column> = {}): Column {
  return {
    name,
    position: 1,
    type: { raw: "integer", base: "integer" },
    nullable: true,
    default: null,
    comment: null,
    is_primary_key: false,
    is_foreign_key: false,
    ...overrides,
  };
}

function entity(name: string, columns: Column[], overrides: Partial<Entity> = {}): Entity {
  return {
    id: `datavault.${name}`,
    namespace: "datavault",
    name,
    kind: "table",
    comment: null,
    columns,
    primary_key: null,
    unique: [],
    ...overrides,
  };
}

function relationship(overrides: Partial<Relationship> = {}): Relationship {
  return {
    id: "rel-1",
    source: { entity: "datavault.facts", columns: ["datesk"] },
    target: { entity: "datavault.gold_DimDate", columns: ["datesk"] },
    cardinality: "many_to_one",
    origin: "inferred_naming",
    confidence: 0.9,
    note: "surrogate key",
    ...overrides,
  };
}

function graph(entities: Entity[], relationships: Relationship[] = []): SchemaGraph {
  return {
    version: "1",
    source: {
      id: "pg-datavault",
      dialect: "postgres",
      label: "Data Vault",
      captured_at: "2026-07-20T00:00:00Z",
      container: { namespace: "datavault" },
    },
    entities,
    relationships,
  };
}

describe("keyRolesByEntity", () => {
  it("reads a declared primary key straight off the column flag", () => {
    const roles = keyRolesByEntity(graph([entity("t", [column("id", { is_primary_key: true })])]));

    expect(roles.get("datavault.t")!.get("id")).toEqual({ role: "pk", inferred: false });
  });

  it("reads a declared foreign key straight off the column flag", () => {
    const roles = keyRolesByEntity(graph([entity("t", [column("user_id", { is_foreign_key: true })])]));

    expect(roles.get("datavault.t")!.get("user_id")).toEqual({ role: "fk", inferred: false });
  });

  // The whole reason this module exists: datavault declares nothing, so its keys
  // must be read off the inferred edges instead.
  it("marks the referenced ('one') end of an inferred edge as an inferred PK", () => {
    const roles = keyRolesByEntity(
      graph(
        [entity("facts", [column("datesk")]), entity("gold_DimDate", [column("datesk")])],
        [relationship()],
      ),
    );

    expect(roles.get("datavault.gold_DimDate")!.get("datesk")).toEqual({ role: "pk", inferred: true });
  });

  it("marks the referencing ('many') end of an inferred edge as an inferred FK", () => {
    const roles = keyRolesByEntity(
      graph(
        [entity("facts", [column("datesk")]), entity("gold_DimDate", [column("datesk")])],
        [relationship()],
      ),
    );

    expect(roles.get("datavault.facts")!.get("datesk")).toEqual({ role: "fk", inferred: true });
  });

  // A declared edge carries no per-column role here - the column flags already
  // do, and reading one off the edge would mislabel a referenced *unique* column.
  it("ignores declared edges, leaving unflagged referenced columns roleless", () => {
    const roles = keyRolesByEntity(
      graph(
        [entity("facts", [column("datesk")]), entity("dim", [column("datesk")])],
        [relationship({ origin: "declared", confidence: 1, note: null })],
      ),
    );

    expect(roles.get("datavault.dim")?.get("datesk")).toBeUndefined();
    expect(roles.get("datavault.facts")?.get("datesk")).toBeUndefined();
  });

  it("lets a declared foreign key outrank an inferred PK guess on the same column", () => {
    // facts.datesk is a declared FK, and is also the referenced end of a second
    // inferred edge. Declared wins.
    const roles = keyRolesByEntity(
      graph(
        [
          entity("facts", [column("datesk", { is_foreign_key: true })]),
          entity("other", [column("datesk")]),
        ],
        [
          relationship({
            id: "rel-2",
            source: { entity: "datavault.other", columns: ["datesk"] },
            target: { entity: "datavault.facts", columns: ["datesk"] },
          }),
        ],
      ),
    );

    expect(roles.get("datavault.facts")!.get("datesk")).toEqual({ role: "fk", inferred: false });
  });

  it("prefers PK over FK when a column is both the referenced and referencing end", () => {
    // A bridge column that is both source and target across two inferred edges.
    const roles = keyRolesByEntity(
      graph(
        [
          entity("a", [column("sk")]),
          entity("bridge", [column("sk")]),
          entity("b", [column("sk")]),
        ],
        [
          relationship({
            id: "into-bridge",
            source: { entity: "datavault.a", columns: ["sk"] },
            target: { entity: "datavault.bridge", columns: ["sk"] },
          }),
          relationship({
            id: "out-of-bridge",
            source: { entity: "datavault.bridge", columns: ["sk"] },
            target: { entity: "datavault.b", columns: ["sk"] },
          }),
        ],
      ),
    );

    expect(roles.get("datavault.bridge")!.get("sk")).toEqual({ role: "pk", inferred: true });
  });

  it("leaves an entity with no key columns out of the map", () => {
    const roles = keyRolesByEntity(graph([entity("plain", [column("a"), column("b")])]));

    expect(roles.get("datavault.plain")).toBeUndefined();
  });
});
