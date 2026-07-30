import { describe, expect, it } from "vitest";

import { neighbourhood } from "./focus";
import type { Entity, Relationship, SchemaGraph } from "./types";

function entity(name: string): Entity {
  return {
    id: `datavault.${name}`,
    namespace: "datavault",
    name,
    kind: "table",
    comment: null,
    columns: [],
    primary_key: null,
    unique: [],
  };
}

function rel(id: string, from: string, to: string): Relationship {
  return {
    id,
    source: { entity: `datavault.${from}`, columns: ["datesk"] },
    target: { entity: `datavault.${to}`, columns: ["datesk"] },
    cardinality: "many_to_one",
    origin: "inferred_naming",
    confidence: 0.9,
    note: null,
  };
}

function graph(entities: Entity[], relationships: Relationship[]): SchemaGraph {
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

const STAR = graph(
  [entity("dim"), entity("a"), entity("b"), entity("c"), entity("island")],
  [rel("a-dim", "a", "dim"), rel("b-dim", "b", "dim"), rel("c-dim", "c", "dim")],
);

describe("neighbourhood", () => {
  it("keeps the focused entity and its direct neighbours", () => {
    const { nodeIds } = neighbourhood(STAR, "datavault.a");

    expect([...nodeIds].sort()).toEqual(["datavault.a", "datavault.dim"]);
  });

  it("follows edges in both directions", () => {
    // `a` is the source and `dim` the target, so focusing either must find the
    // other - an ERD reader does not care which way the arrow points.
    expect(neighbourhood(STAR, "datavault.dim").nodeIds.has("datavault.a")).toBe(true);
    expect(neighbourhood(STAR, "datavault.a").nodeIds.has("datavault.dim")).toBe(true);
  });

  it("keeps an unconnected entity to itself alone", () => {
    const { nodeIds, edgeIds } = neighbourhood(STAR, "datavault.island");

    expect([...nodeIds]).toEqual(["datavault.island"]);
    expect(edgeIds.size).toBe(0);
  });

  // The documented weakness, pinned so nobody mistakes it for a bug: the hub of
  // a star touches everything, so focusing it hides nothing.
  it("hides nothing when the hub of a star is focused", () => {
    const { nodeIds } = neighbourhood(STAR, "datavault.dim");

    expect(nodeIds.size).toBe(4); // dim + a + b + c; only `island` drops out
  });

  it("keeps an edge between two survivors, not only edges touching the focus", () => {
    // Otherwise the reader sees two related tables on screen with no line
    // between them, which misrepresents the schema.
    const g = graph(
      [entity("focus"), entity("x"), entity("y")],
      [rel("f-x", "focus", "x"), rel("f-y", "focus", "y"), rel("x-y", "x", "y")],
    );

    const { edgeIds } = neighbourhood(g, "datavault.focus");

    expect([...edgeIds].sort()).toEqual(["f-x", "f-y", "x-y"]);
  });

  it("ignores an edge whose other end is not on the canvas", () => {
    const g = graph([entity("a")], [rel("dangling", "a", "missing")]);

    const { nodeIds, edgeIds } = neighbourhood(g, "datavault.a");

    expect([...nodeIds]).toEqual(["datavault.a"]);
    expect(edgeIds.size).toBe(0);
  });

  it("keeps a self-reference visible without inventing a neighbour", () => {
    const g = graph([entity("tree")], [rel("self", "tree", "tree")]);

    const { nodeIds, edgeIds } = neighbourhood(g, "datavault.tree");

    expect([...nodeIds]).toEqual(["datavault.tree"]);
    expect([...edgeIds]).toEqual(["self"]);
  });

  it("returns an empty neighbourhood for an unknown entity", () => {
    const { nodeIds, edgeIds } = neighbourhood(STAR, "datavault.nope");

    expect(nodeIds.size).toBe(0);
    expect(edgeIds.size).toBe(0);
  });
});
