import { describe, expect, it } from "vitest";

import { autoLayout, mergeLayout } from "./autoLayout";
import type { Column, Entity, Relationship, SchemaGraph } from "./types";

function column(name: string): Column {
  return {
    name,
    position: 1,
    type: { raw: "integer", base: "integer" },
    nullable: true,
    default: null,
    comment: null,
    is_primary_key: false,
    is_foreign_key: false,
  };
}

function entity(name: string): Entity {
  return {
    id: `datavault.${name}`,
    namespace: "datavault",
    name,
    kind: "table",
    comment: null,
    columns: [column("id")],
    primary_key: null,
    unique: [],
  };
}

function graph(names: string[], relationships: Relationship[] = []): SchemaGraph {
  return {
    version: "1",
    source: {
      id: "pg-datavault",
      dialect: "postgres",
      label: "Data Vault",
      captured_at: "2026-07-20T00:00:00Z",
      container: {},
    },
    entities: names.map(entity),
    relationships,
  };
}

describe("autoLayout", () => {
  it("gives every entity a distinct position", () => {
    // The failure this guards is the one that makes the app look broken: every
    // node stacked at the origin.
    const positions = autoLayout(graph(["a", "b", "c"]));

    expect(Object.keys(positions)).toHaveLength(3);
    const distinct = new Set(Object.values(positions).map((p) => `${p.x},${p.y}`));
    expect(distinct.size).toBe(3);
  });

  it("ignores an edge pointing at an entity it does not have", () => {
    // dagre invents a node for an unknown id, which would place a phantom box.
    const positions = autoLayout(
      graph(["a"], [
        {
          id: "rel",
          source: { entity: "datavault.a", columns: ["id"] },
          target: { entity: "datavault.ghost", columns: ["id"] },
          cardinality: "many_to_one",
          origin: "declared",
          confidence: 1,
          note: null,
        },
      ]),
    );

    expect(Object.keys(positions)).toEqual(["datavault.a"]);
  });

  it("handles an empty schema without throwing", () => {
    expect(autoLayout(graph([]))).toEqual({});
  });
});

describe("mergeLayout", () => {
  it("keeps every saved position untouched", () => {
    const saved = { "datavault.a": { x: 5, y: 5 }, "datavault.b": { x: 9, y: 9 } };

    expect(mergeLayout(graph(["a", "b"]), saved)).toEqual(saved);
  });

  it("computes a position only for entities that lack one", () => {
    // The case this exists for: a schema gains a table after you arranged the
    // diagram. Recomputing everything would throw your arrangement away.
    const saved = { "datavault.a": { x: 5, y: 5 } };

    const merged = mergeLayout(graph(["a", "b"]), saved);

    expect(merged["datavault.a"]).toEqual({ x: 5, y: 5 });
    expect(merged["datavault.b"]).toBeDefined();
    expect(merged["datavault.b"]).not.toEqual({ x: 0, y: 0 });
  });

  it("drops saved positions for entities that no longer exist", () => {
    // Otherwise a dropped table's coordinates get written back on every save,
    // accumulating forever.
    const saved = { "datavault.a": { x: 5, y: 5 }, "datavault.deleted": { x: 1, y: 1 } };

    expect(mergeLayout(graph(["a"]), saved)).toEqual({ "datavault.a": { x: 5, y: 5 } });
  });

  it("lays out from scratch when nothing is saved", () => {
    const merged = mergeLayout(graph(["a", "b"]), {});

    expect(Object.keys(merged)).toHaveLength(2);
  });
});
