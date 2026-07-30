import { describe, expect, it } from "vitest";

import { confidenceLabel, entityDetail } from "./entityDetail";
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
    origin: "declared",
    confidence: 1,
    note: null,
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

const FACTS = entity("facts", [
  column("datesk"),
  column("amount", { nullable: false }),
  column("note"),
]);
const DIM_DATE = entity("gold_DimDate", [column("datesk", { is_primary_key: true })]);

describe("entityDetail", () => {
  it("returns null for an entity that is not in the graph", () => {
    expect(entityDetail(graph([FACTS]), "datavault.nope")).toBeNull();
  });

  it("counts columns and nullables", () => {
    const detail = entityDetail(graph([FACTS]), "datavault.facts")!;

    expect(detail.columnCount).toBe(3);
    expect(detail.nullableCount).toBe(2);
  });

  it("reports the same key columns the card shows in keys mode", () => {
    const detail = entityDetail(graph([FACTS, DIM_DATE], [relationship()]), "datavault.facts")!;

    // datesk earns its place by participating in a relationship, not by being
    // declared a key - datavault has no declared keys at all.
    expect(detail.keyColumns.map((c) => c.name)).toEqual(["datesk"]);
  });

  it("splits outgoing references from incoming ones", () => {
    const g = graph([FACTS, DIM_DATE], [relationship()]);

    const facts = entityDetail(g, "datavault.facts")!;
    expect(facts.references.map((r) => r.entityName)).toEqual(["gold_DimDate"]);
    expect(facts.referencedBy).toEqual([]);

    const dim = entityDetail(g, "datavault.gold_DimDate")!;
    expect(dim.references).toEqual([]);
    expect(dim.referencedBy.map((r) => r.entityName)).toEqual(["facts"]);
  });

  it("orients local and remote columns from the described entity's side", () => {
    const g = graph(
      [FACTS, DIM_DATE],
      [
        relationship({
          source: { entity: "datavault.facts", columns: ["datesk"] },
          target: { entity: "datavault.gold_DimDate", columns: ["date_key"] },
        }),
      ],
    );

    expect(entityDetail(g, "datavault.facts")!.references[0]).toMatchObject({
      localColumns: ["datesk"],
      remoteColumns: ["date_key"],
    });
    expect(entityDetail(g, "datavault.gold_DimDate")!.referencedBy[0]).toMatchObject({
      localColumns: ["date_key"],
      remoteColumns: ["datesk"],
    });
  });

  it("drops a relationship whose other end is not on the canvas", () => {
    // Otherwise the panel renders a link to an entity nobody can navigate to.
    const dangling = relationship({ target: { entity: "datavault.missing", columns: ["x"] } });

    const detail = entityDetail(graph([FACTS], [dangling]), "datavault.facts")!;

    expect(detail.references).toEqual([]);
    expect(detail.neighbourIds).toEqual([]);
  });

  it("lists a self-reference once, as outgoing, and not as a neighbour", () => {
    // A parent_id on a tree table. Listing it in both directions would read as
    // two different relationships, and counting it as a neighbour would make
    // Focus claim the table is connected to something other than itself.
    const tree = entity("tree", [column("id"), column("parent_id")]);
    const self = relationship({
      id: "self",
      source: { entity: "datavault.tree", columns: ["parent_id"] },
      target: { entity: "datavault.tree", columns: ["id"] },
    });

    const detail = entityDetail(graph([tree], [self]), "datavault.tree")!;

    expect(detail.references).toHaveLength(1);
    expect(detail.references[0].selfReference).toBe(true);
    expect(detail.referencedBy).toEqual([]);
    expect(detail.neighbourIds).toEqual([]);
  });

  it("counts each neighbour once even across several relationships", () => {
    const g = graph(
      [FACTS, DIM_DATE],
      [
        relationship({ id: "a" }),
        relationship({ id: "b", source: { entity: "datavault.facts", columns: ["amount"] } }),
      ],
    );

    const detail = entityDetail(g, "datavault.facts")!;

    expect(detail.references).toHaveLength(2);
    expect(detail.neighbourIds).toEqual(["datavault.gold_DimDate"]);
  });

  it("carries the inference note, which the edge label has no room for", () => {
    const inferred = relationship({
      origin: "inferred_naming",
      confidence: 0.9,
      note: "surrogate key: DateSK matched the DimDate calendar dimension",
    });

    const detail = entityDetail(graph([FACTS, DIM_DATE], [inferred]), "datavault.facts")!;

    expect(detail.references[0].note).toContain("surrogate key");
  });
});

describe("confidenceLabel", () => {
  it("says nothing for a declared edge, which is a fact rather than a guess", () => {
    const detail = entityDetail(graph([FACTS, DIM_DATE], [relationship()]), "datavault.facts")!;
    expect(confidenceLabel(detail.references[0])).toBeNull();
  });

  it("reports a percentage for an inferred edge", () => {
    const g = graph(
      [FACTS, DIM_DATE],
      [relationship({ origin: "inferred_naming", confidence: 0.8 })],
    );
    const detail = entityDetail(g, "datavault.facts")!;

    expect(confidenceLabel(detail.references[0])).toBe("80% confident");
  });
});
