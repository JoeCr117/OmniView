import { describe, expect, it } from "vitest";

import type { ColumnMode, ViewState } from "./displayMode";
import { NODE_HANDLE, handleId, nodeSize, toEdges, toNodes, visibleColumns } from "./toFlow";
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

const view = (defaultMode: ColumnMode, overrides: Record<string, ColumnMode> = {}): ViewState => ({
  defaultMode,
  overrides,
});

const ALL = view("all");
const KEYS = view("keys");
const NONE = view("none");

const FACTS = entity("facts", [column("datesk"), column("amount")]);
const DIM_DATE = entity("gold_DimDate", [column("datesk", { is_primary_key: true })]);

describe("toNodes", () => {
  it("places each entity at its saved position", () => {
    const nodes = toNodes(graph([FACTS, DIM_DATE]), { "datavault.facts": { x: 10, y: 20 } }, ALL);

    expect(nodes.map((node) => node.id)).toEqual(["datavault.facts", "datavault.gold_DimDate"]);
    expect(nodes[0].position).toEqual({ x: 10, y: 20 });
  });

  it("falls back to the origin for an entity with no saved position", () => {
    const nodes = toNodes(graph([FACTS]), {}, ALL);
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("marks only the columns an edge actually touches", () => {
    const nodes = toNodes(graph([FACTS, DIM_DATE], [relationship()]), {}, ALL);
    const facts = nodes.find((node) => node.id === "datavault.facts")!;

    expect(facts.data.connectedColumns.has("datesk")).toBe(true);
    expect(facts.data.connectedColumns.has("amount")).toBe(false);
  });

  it("gives every node the custom type, so React Flow uses TableNode", () => {
    const nodes = toNodes(graph([FACTS, DIM_DATE]), {}, ALL);
    expect(nodes.every((node) => node.type === "erdTable")).toBe(true);
  });

  it("carries the resolved mode in data, so a change re-renders the card", () => {
    const nodes = toNodes(
      graph([FACTS, DIM_DATE]),
      {},
      view("all", { "datavault.facts": "none" }),
    );

    expect(nodes.find((n) => n.id === "datavault.facts")!.data.mode).toBe("none");
    expect(nodes.find((n) => n.id === "datavault.gold_DimDate")!.data.mode).toBe("all");
  });
});

describe("toEdges", () => {
  it("anchors an edge to the handles of its columns", () => {
    const [edge] = toEdges(graph([FACTS, DIM_DATE], [relationship()]), ALL);

    expect(edge.source).toBe("datavault.facts");
    expect(edge.target).toBe("datavault.gold_DimDate");
    expect(edge.sourceHandle).toBe(handleId("datesk", "source"));
    expect(edge.targetHandle).toBe(handleId("datesk", "target"));
  });

  it("drops an edge whose endpoint is not on the canvas", () => {
    // React Flow renders nothing for a dangling edge and logs an error, so this
    // has to be caught here rather than surfacing as console noise.
    const dangling = relationship({ target: { entity: "datavault.missing", columns: ["datesk"] } });

    expect(toEdges(graph([FACTS], [dangling]), ALL)).toEqual([]);
  });

  it("falls back to the card handle when the column does not exist", () => {
    const wrongColumn = relationship({
      source: { entity: "datavault.facts", columns: ["no_such_column"] },
    });

    const [edge] = toEdges(graph([FACTS, DIM_DATE], [wrongColumn]), ALL);

    expect(edge.sourceHandle).toBe(NODE_HANDLE.source);
    expect(edge.targetHandle).toBe(handleId("datesk", "target"));
  });

  it("dashes an inferred edge and labels its confidence", () => {
    const inferred = relationship({
      origin: "inferred_naming",
      confidence: 0.9,
      note: "surrogate key",
    });

    const [edge] = toEdges(graph([FACTS, DIM_DATE], [inferred]), ALL);

    expect(edge.style?.strokeDasharray).toBeDefined();
    expect(edge.label).toBe("90%");
    expect(edge.data?.note).toBe("surrogate key");
  });

  it("leaves a declared edge solid and unlabelled", () => {
    const [edge] = toEdges(graph([FACTS, DIM_DATE], [relationship()]), ALL);

    expect(edge.style?.strokeDasharray).toBeUndefined();
    expect(edge.label).toBeUndefined();
  });

  it("keeps edge ids unique, since React Flow drops duplicates silently", () => {
    const edges = toEdges(
      graph(
        [FACTS, DIM_DATE],
        [relationship(), relationship({ id: "rel-2", origin: "inferred_naming" })],
      ),
      ALL,
    );

    expect(new Set(edges.map((edge) => edge.id)).size).toBe(edges.length);
  });

  // The regression this whole design exists for. Collapsing a card unmounts its
  // column handles; without a card-level fallback the edge strands at the node's
  // origin, which reads as a rendering bug rather than a collapsed table.
  it.each<[ColumnMode, ViewState]>([
    ["keys", KEYS],
    ["none", NONE],
    ["all", ALL],
  ])("keeps every edge anchored to a mounted handle in %s mode", (_mode, state) => {
    const edges = toEdges(graph([FACTS, DIM_DATE], [relationship()]), state);

    expect(edges).toHaveLength(1);
    expect(edges[0].sourceHandle).toBeTruthy();
    expect(edges[0].targetHandle).toBeTruthy();
  });

  it("uses the card handle on a collapsed node and the column handle on an expanded one", () => {
    const [edge] = toEdges(
      graph([FACTS, DIM_DATE], [relationship()]),
      view("all", { "datavault.facts": "none" }),
    );

    expect(edge.sourceHandle).toBe(NODE_HANDLE.source);
    expect(edge.targetHandle).toBe(handleId("datesk", "target"));
  });
});

describe("visibleColumns", () => {
  const wide = (count: number) =>
    entity(
      "wide",
      Array.from({ length: count }, (_, i) => column(`c${i}`)),
    );

  it("shows every column in all mode, however wide the table", () => {
    const { shown, hidden } = visibleColumns(wide(50), new Set(), "all");

    expect(shown).toHaveLength(50);
    expect(hidden).toBe(0);
  });

  it("shows nothing in none mode, and counts everything as hidden", () => {
    const { shown, hidden } = visibleColumns(wide(30), new Set(), "none");

    expect(shown).toEqual([]);
    expect(hidden).toBe(30);
  });

  it("keeps primary keys, foreign keys and connected columns in keys mode", () => {
    const columns = [
      column("id", { is_primary_key: true }),
      column("other_id", { is_foreign_key: true }),
      column("datesk"),
      column("amount"),
    ];

    const { shown, hidden } = visibleColumns(entity("t", columns), new Set(["datesk"]), "keys");

    expect(shown.map((c) => c.name)).toEqual(["id", "other_id", "datesk"]);
    expect(hidden).toBe(1);
  });

  // datavault declares no primary keys at all - dbt builds via CTAS, which
  // carries no constraints. If "key" meant only PK/FK, keys mode would empty
  // all 22 of its cards and detach all 17 inferred edges.
  it("keeps a card non-empty in keys mode when its only keys are relationship columns", () => {
    const noKeys = entity("gold_Golden1_AllTransactions", [
      column("datesk"),
      column("description"),
      column("amount"),
    ]);

    const { shown } = visibleColumns(noKeys, new Set(["datesk"]), "keys");

    expect(shown.map((c) => c.name)).toEqual(["datesk"]);
  });

  it("keeps catalog order rather than floating the keys to the top", () => {
    const columns = [column("a"), column("b"), column("c", { is_primary_key: true })];

    const { shown } = visibleColumns(entity("t", columns), new Set(["a"]), "keys");

    expect(shown.map((c) => c.name)).toEqual(["a", "c"]);
  });

  it("handles a table with no columns", () => {
    for (const mode of ["all", "keys", "none"] as const) {
      expect(visibleColumns(entity("empty", []), new Set(), mode)).toEqual({ shown: [], hidden: 0 });
    }
  });
});

describe("nodeSize", () => {
  const many = (count: number) =>
    entity(
      "wide",
      Array.from({ length: count }, (_, i) => column(`c${i}`)),
    );

  it("grows with the column count, so dagre can lay out before anything renders", () => {
    const narrow = nodeSize(entity("a", [column("one")]), new Set(), "all");
    const wide = nodeSize(
      entity("b", [column("one"), column("two"), column("three")]),
      new Set(),
      "all",
    );

    expect(wide.height).toBeGreaterThan(narrow.height);
    expect(wide.width).toBe(narrow.width);
  });

  it("keeps growing in all mode - there is no cap any more", () => {
    expect(nodeSize(many(50), new Set(), "all").height).toBeGreaterThan(
      nodeSize(many(20), new Set(), "all").height,
    );
  });

  it("shrinks to a bare header in none mode, whatever the table", () => {
    expect(nodeSize(many(50), new Set(), "none")).toEqual(nodeSize(many(1), new Set(), "none"));
  });

  it("counts the '+N more' row in keys mode", () => {
    // A size that disagrees with the DOM makes dagre overlap or over-space
    // nodes, so this has to track TableNode exactly.
    const oneKeyOfThree = entity("t", [
      column("datesk"),
      column("a"),
      column("b"),
    ]);

    const keys = nodeSize(oneKeyOfThree, new Set(["datesk"]), "keys");
    const bare = nodeSize(entity("t", [column("datesk")]), new Set(["datesk"]), "keys");

    // One key row + one "+2 more" row against a single key row and nothing else.
    expect(keys.height).toBe(bare.height + 24);
  });

  it("orders the three modes by height", () => {
    const e = many(20);
    const connected = new Set(["c0"]);

    const all = nodeSize(e, connected, "all").height;
    const keys = nodeSize(e, connected, "keys").height;
    const none = nodeSize(e, connected, "none").height;

    expect(all).toBeGreaterThan(keys);
    expect(keys).toBeGreaterThan(none);
  });
});
