import { describe, expect, it } from "vitest";

import { bridgeCandidates, joinColumns, joinGroups } from "./joinGraph";
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
    id: `app.${name}`,
    namespace: "app",
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
    source: { entity: "app.a", columns: ["a_id"] },
    target: { entity: "app.b", columns: ["id"] },
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
      id: "pg-omniview",
      dialect: "postgres",
      label: "OmniView",
      captured_at: "2026-07-20T00:00:00Z",
      container: { namespace: "app" },
    },
    entities,
    relationships,
  };
}

// The exact shape from the design critique: a real four-table chain where the
// middle bridge (auth_group_permissions) is left unpicked. auth_permission and
// django_content_type join each other directly and must land in the same
// join group even though neither can reach auth_group without the bridge.
const AUTH_GROUP = entity("auth_group", [column("id")]);
const AUTH_GROUP_PERMISSIONS = entity("auth_group_permissions", [
  column("group_id"),
  column("permission_id"),
]);
const AUTH_PERMISSION = entity("auth_permission", [column("id"), column("content_type_id")]);
const DJANGO_CONTENT_TYPE = entity("django_content_type", [column("id")]);
const RAWDATA_RAWFILE = entity("rawdata_rawfile", [column("id")]);

const GROUP_TO_BRIDGE = relationship({
  id: "rel-group-bridge",
  source: { entity: "app.auth_group_permissions", columns: ["group_id"] },
  target: { entity: "app.auth_group", columns: ["id"] },
});
const PERMISSION_TO_BRIDGE = relationship({
  id: "rel-permission-bridge",
  source: { entity: "app.auth_group_permissions", columns: ["permission_id"] },
  target: { entity: "app.auth_permission", columns: ["id"] },
});
const PERMISSION_TO_CONTENT_TYPE = relationship({
  id: "rel-permission-contenttype",
  source: { entity: "app.auth_permission", columns: ["content_type_id"] },
  target: { entity: "app.django_content_type", columns: ["id"] },
});

const AUTH_GRAPH = graph(
  [AUTH_GROUP, AUTH_GROUP_PERMISSIONS, AUTH_PERMISSION, DJANGO_CONTENT_TYPE, RAWDATA_RAWFILE],
  [GROUP_TO_BRIDGE, PERMISSION_TO_BRIDGE, PERMISSION_TO_CONTENT_TYPE],
);

describe("joinColumns", () => {
  it("reads the relationship from either side, anchor first", () => {
    const rel = relationship({
      source: { entity: "app.a", columns: ["a_id"] },
      target: { entity: "app.b", columns: ["b_id"] },
    });

    expect(joinColumns([rel], "app.a", "app.b")).toEqual({ anchor: ["a_id"], joined: ["b_id"] });
    expect(joinColumns([rel], "app.b", "app.a")).toEqual({ anchor: ["b_id"], joined: ["a_id"] });
  });

  it("returns null for a pair with no relationship at all", () => {
    expect(joinColumns([], "app.a", "app.b")).toBeNull();
  });

  it.each<[string, string[], string[]]>([
    ["a mismatched pair", ["a_id", "extra"], ["b_id"]],
    ["an empty pair", [], []],
  ])("treats %s as unusable, not a join", (_case, source, target) => {
    const rel = relationship({
      source: { entity: "app.a", columns: source },
      target: { entity: "app.b", columns: target },
    });

    expect(joinColumns([rel], "app.a", "app.b")).toBeNull();
  });

  it("keeps scanning past an unusable relationship and returns the next usable one for the same pair", () => {
    // Gap 3: a pair can have two relationships (e.g. an admin override plus a
    // stale inferred edge with mismatched columns). The unusable first entry
    // must not short-circuit the search - `joinColumns` promises the *first
    // usable* relationship, not the first relationship, full stop.
    const unusable = relationship({
      id: "rel-bad",
      source: { entity: "app.a", columns: ["a_id", "extra"] },
      target: { entity: "app.b", columns: ["b_id"] },
    });
    const usable = relationship({
      id: "rel-good",
      source: { entity: "app.a", columns: ["good_a_id"] },
      target: { entity: "app.b", columns: ["good_b_id"] },
    });

    expect(joinColumns([unusable, usable], "app.a", "app.b")).toEqual({
      anchor: ["good_a_id"],
      joined: ["good_b_id"],
    });
  });
});

describe("joinGroups", () => {
  it("groups auth_permission with django_content_type even though the bridge to auth_group is unpicked", () => {
    const picked = ["app.auth_group", "app.auth_permission", "app.django_content_type", "app.rawdata_rawfile"];

    const groups = joinGroups(AUTH_GRAPH.relationships, picked);

    expect(groups).toEqual([
      ["app.auth_group"],
      ["app.auth_permission", "app.django_content_type"],
      ["app.rawdata_rawfile"],
    ]);
  });

  it("orders members and groups by pick position, not by declaration order in the graph", () => {
    // Entities are declared A, B, C but picked in the order C, B, A. A-B are
    // related, C is isolated. Naive iteration over the graph's entity order
    // would put A before B and would not put C's singleton group first.
    const a = entity("a", [column("id")]);
    const b = entity("b", [column("a_id")]);
    const c = entity("c", [column("id")]);
    const aToB = relationship({
      source: { entity: "app.b", columns: ["a_id"] },
      target: { entity: "app.a", columns: ["id"] },
    });
    const g = graph([a, b, c], [aToB]);

    const groups = joinGroups(g.relationships, ["app.c", "app.b", "app.a"]);

    expect(groups).toEqual([["app.c"], ["app.b", "app.a"]]);
  });

  it("keeps a pair unrelated when their only relationship has mismatched columns", () => {
    const unusable = relationship({
      source: { entity: "app.a", columns: ["id", "extra"] },
      target: { entity: "app.b", columns: ["id"] },
    });

    const groups = joinGroups([unusable], ["app.a", "app.b"]);

    expect(groups).toEqual([["app.a"], ["app.b"]]);
  });
});

describe("bridgeCandidates", () => {
  it("finds the unpicked table that would connect two join groups", () => {
    const picked = ["app.auth_group", "app.auth_permission", "app.django_content_type", "app.rawdata_rawfile"];

    const candidates = bridgeCandidates(AUTH_GRAPH, picked);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].entityId).toBe("app.auth_group_permissions");
    expect(candidates[0].connectsGroups).toEqual([0, 1]);
  });

  it("returns nothing when the selection is already fully connected", () => {
    const picked = ["app.auth_group", "app.auth_group_permissions", "app.auth_permission", "app.django_content_type"];

    expect(bridgeCandidates(AUTH_GRAPH, picked)).toEqual([]);
  });

  it("returns nothing when the gap needs two hops, rather than guessing a single-table fix", () => {
    const p = entity("p", [column("id")]);
    const q = entity("q", [column("id")]);
    const x = entity("x", [column("p_id"), column("id")]);
    const y = entity("y", [column("x_id"), column("q_id")]);
    const pToX = relationship({
      source: { entity: "app.x", columns: ["p_id"] },
      target: { entity: "app.p", columns: ["id"] },
    });
    const xToY = relationship({
      source: { entity: "app.y", columns: ["x_id"] },
      target: { entity: "app.x", columns: ["id"] },
    });
    const yToQ = relationship({
      source: { entity: "app.y", columns: ["q_id"] },
      target: { entity: "app.q", columns: ["id"] },
    });
    const g = graph([p, q, x, y], [pToX, xToY, yToQ]);

    expect(bridgeCandidates(g, ["app.p", "app.q"])).toEqual([]);
  });

  it("does not offer a bridge whose only relationships to the groups are unusable", () => {
    const a = entity("a", [column("id"), column("extra")]);
    const b = entity("b", [column("id"), column("extra")]);
    const bridge = entity("bridge", [column("id"), column("extra")]);
    const unusableToA = relationship({
      id: "rel-a",
      source: { entity: "app.bridge", columns: ["id", "extra"] },
      target: { entity: "app.a", columns: ["id"] },
    });
    const unusableToB = relationship({
      id: "rel-b",
      source: { entity: "app.bridge", columns: [] },
      target: { entity: "app.b", columns: [] },
    });
    const g = graph([a, b, bridge], [unusableToA, unusableToB]);

    expect(bridgeCandidates(g, ["app.a", "app.b"])).toEqual([]);
  });

  it("ranks a candidate connecting all three groups first, then prefers touching group 0, then breaks ties by id", () => {
    const r = entity("r", [column("id")]);
    const s = entity("s", [column("id")]);
    const t = entity("t", [column("id")]);
    const bridgeAll = entity("bridge_all", [column("r_id"), column("s_id"), column("t_id")]);
    const bridgeRs = entity("bridge_rs_a", [column("r_id"), column("s_id")]);
    const bridgeRs2 = entity("bridge_rs_b", [column("r_id"), column("s_id")]);
    const bridgeSt = entity("bridge_st", [column("s_id"), column("t_id")]);

    const relFor = (bridgeName: string, targetName: string, column_: string) =>
      relationship({
        id: `rel-${bridgeName}-${targetName}`,
        source: { entity: `app.${bridgeName}`, columns: [column_] },
        target: { entity: `app.${targetName}`, columns: ["id"] },
      });

    const relationships = [
      relFor("bridge_all", "r", "r_id"),
      relFor("bridge_all", "s", "s_id"),
      relFor("bridge_all", "t", "t_id"),
      relFor("bridge_rs_a", "r", "r_id"),
      relFor("bridge_rs_a", "s", "s_id"),
      relFor("bridge_rs_b", "r", "r_id"),
      relFor("bridge_rs_b", "s", "s_id"),
      relFor("bridge_st", "s", "s_id"),
      relFor("bridge_st", "t", "t_id"),
    ];
    const g = graph([r, s, t, bridgeAll, bridgeRs, bridgeRs2, bridgeSt], relationships);

    const candidates = bridgeCandidates(g, ["app.r", "app.s", "app.t"]);

    expect(candidates.map((c) => c.entityId)).toEqual([
      "app.bridge_all",
      "app.bridge_rs_a",
      "app.bridge_rs_b",
      "app.bridge_st",
    ]);
  });
});
