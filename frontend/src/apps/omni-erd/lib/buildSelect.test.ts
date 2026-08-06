import { describe, expect, it } from "vitest";

import { buildSelect } from "./buildSelect";
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

// datavault relations are CamelCase and their columns are lowercase - dbt
// quotes the relation name and leaves the columns to Postgres' folding. Every
// fixture here keeps that shape, because getting it wrong is what makes a
// generated query fail to run.
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
    source: { entity: "datavault.gold_Golden1_AllTransactions", columns: ["datesk"] },
    target: { entity: "datavault.gold_DimDate", columns: ["datesk"] },
    cardinality: "many_to_one",
    origin: "declared",
    confidence: 1,
    note: null,
    ...overrides,
  };
}

function graph(
  entities: Entity[],
  relationships: Relationship[] = [],
  dialect = "postgres",
): SchemaGraph {
  return {
    version: "1",
    source: {
      id: "pg-datavault",
      dialect,
      label: "Data Vault",
      captured_at: "2026-07-20T00:00:00Z",
      container: { namespace: "datavault" },
    },
    entities,
    relationships,
  };
}

const TX = entity("gold_Golden1_AllTransactions", [
  column("datesk"),
  column("categorysk"),
  column("amount"),
]);
const DIM_DATE = entity("gold_DimDate", [column("datesk"), column("yearsk")]);
const DIM_YEAR = entity("gold_DimYear", [column("yearsk")]);
const DIM_CATEGORY = entity("gold_DimCategory", [column("categorysk")]);
const ORPHAN = entity("gold_Orphan", [column("id")]);

const TX_DATE = relationship({ id: "rel-date" });
const DATE_YEAR = relationship({
  id: "rel-year",
  source: { entity: "datavault.gold_DimDate", columns: ["yearsk"] },
  target: { entity: "datavault.gold_DimYear", columns: ["yearsk"] },
});
const TX_CATEGORY = relationship({
  id: "rel-category",
  source: { entity: "datavault.gold_Golden1_AllTransactions", columns: ["categorysk"] },
  target: { entity: "datavault.gold_DimCategory", columns: ["categorysk"] },
});

const STAR = graph([TX, DIM_DATE, DIM_YEAR, DIM_CATEGORY, ORPHAN], [
  TX_DATE,
  DATE_YEAR,
  TX_CATEGORY,
]);

describe("buildSelect", () => {
  it("has nothing to generate from an empty selection", () => {
    const result = buildSelect(STAR, []);

    expect(result.sql).toBeNull();
    expect(result.warnings.map((warning) => warning.code)).toEqual(["empty_selection"]);
    expect(result.included).toEqual([]);
    expect(result.excluded).toEqual([]);
  });

  it("selects one table with no join at all", () => {
    const result = buildSelect(STAR, ["datavault.gold_DimDate"]);

    expect(result.sql).toBe(['SELECT *', 'FROM "datavault"."gold_DimDate" t1'].join("\n"));
    expect(result.warnings).toEqual([]);
    expect(result.included).toEqual(["datavault.gold_DimDate"]);
    expect(result.excluded).toEqual([]);
  });

  it("quotes the relation and the column exactly as the catalog spells them", () => {
    // dbt-postgres quotes relations but not columns, so gold_DimDate holds a
    // `datesk`. Re-casing either end is how the query stops running.
    const result = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
    ]);

    expect(result.sql).toContain('"datavault"."gold_Golden1_AllTransactions" t1');
    expect(result.sql).toContain('t1."datesk" = t2."datesk"');
    expect(result.sql).not.toContain("DateSK");
  });

  it("emits only the first table when the picks have no relationship, never a cross join", () => {
    const result = buildSelect(STAR, ["datavault.gold_DimDate", "datavault.gold_Orphan"]);

    expect(result.sql).toBe(['SELECT *', 'FROM "datavault"."gold_DimDate" t1'].join("\n"));
    expect(result.sql).not.toContain("JOIN");
    expect(result.sql).not.toContain(",");
    expect(result.included).toEqual(["datavault.gold_DimDate"]);
    expect(result.excluded).toEqual(["datavault.gold_Orphan"]);

    const [warning] = result.warnings;
    expect(warning.code).toBe("disconnected");
    expect(warning.entityIds).toEqual(["datavault.gold_Orphan"]);
    expect(warning.message).toContain("datavault.gold_Orphan");
  });

  it("chains A-B-C, anchoring the third table on the second", () => {
    const result = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
      "datavault.gold_DimYear",
    ]);

    expect(result.sql).toBe(
      [
        "SELECT *",
        'FROM "datavault"."gold_Golden1_AllTransactions" t1',
        'JOIN "datavault"."gold_DimDate" t2 ON t1."datesk" = t2."datesk"',
        'JOIN "datavault"."gold_DimYear" t3 ON t2."yearsk" = t3."yearsk"',
      ].join("\n"),
    );
    expect(result.warnings).toEqual([]);
  });

  it("hangs both arms of a star off the first table", () => {
    const result = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
      "datavault.gold_DimCategory",
    ]);

    expect(result.sql).toBe(
      [
        "SELECT *",
        'FROM "datavault"."gold_Golden1_AllTransactions" t1',
        'JOIN "datavault"."gold_DimDate" t2 ON t1."datesk" = t2."datesk"',
        'JOIN "datavault"."gold_DimCategory" t3 ON t1."categorysk" = t3."categorysk"',
      ].join("\n"),
    );
  });

  it("emits the component containing the first pick and excludes the rest", () => {
    const result = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
      "datavault.gold_Orphan",
    ]);

    expect(result.included).toEqual([
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
    ]);
    expect(result.excluded).toEqual(["datavault.gold_Orphan"]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["disconnected"]);
  });

  it("stays rooted on an isolated first pick rather than re-rooting onto the pair behind it", () => {
    // Pick order is the user's stated intent. Quietly reorganising the query
    // around a table they picked second is less predictable than a one-table
    // query that says what it left out.
    const result = buildSelect(STAR, [
      "datavault.gold_Orphan",
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
    ]);

    expect(result.sql).toBe(['SELECT *', 'FROM "datavault"."gold_Orphan" t1'].join("\n"));
    expect(result.included).toEqual(["datavault.gold_Orphan"]);
    expect(result.excluded).toEqual([
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].entityIds).toEqual([
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
    ]);
  });

  it("lets pick order decide which table is t1, and reads the ON from that side", () => {
    const result = buildSelect(STAR, [
      "datavault.gold_DimDate",
      "datavault.gold_Golden1_AllTransactions",
    ]);

    // gold_DimDate is the relationship's *target*, but it was picked first, so
    // it is t1 and it sits on the left of the equals.
    expect(result.sql).toBe(
      [
        "SELECT *",
        'FROM "datavault"."gold_DimDate" t1',
        'JOIN "datavault"."gold_Golden1_AllTransactions" t2 ON t1."datesk" = t2."datesk"',
      ].join("\n"),
    );
  });

  it("reaches a pick that only joins a later pick, which takes a second pass", () => {
    const result = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimYear",
      "datavault.gold_DimDate",
    ]);

    // gold_DimYear joins nothing on the first pass; gold_DimDate lets it in on
    // the second, so the emitted order is not the pick order.
    expect(result.included).toEqual([
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
      "datavault.gold_DimYear",
    ]);
    expect(result.sql).toContain('JOIN "datavault"."gold_DimYear" t3 ON t2."yearsk" = t3."yearsk"');
    expect(result.excluded).toEqual([]);
  });

  it("ANDs a composite join, pairing the two ends positionally", () => {
    const bridge = entity("gold_Bridge", [column("a"), column("b")]);
    const target = entity("gold_Target", [column("x"), column("y")]);
    const composite = relationship({
      source: { entity: "datavault.gold_Bridge", columns: ["a", "b"] },
      target: { entity: "datavault.gold_Target", columns: ["x", "y"] },
    });

    const result = buildSelect(graph([bridge, target], [composite]), [
      "datavault.gold_Bridge",
      "datavault.gold_Target",
    ]);

    expect(result.sql).toContain(
      'JOIN "datavault"."gold_Target" t2 ON t1."a" = t2."x" AND t1."b" = t2."y"',
    );
  });

  it.each<[string, string[], string[]]>([
    ["a mismatched pair", ["a", "b"], ["x"]],
    ["an empty pair", [], []],
  ])("skips %s rather than crashing, leaving the table disconnected", (_case, source, target) => {
    const bridge = entity("gold_Bridge", [column("a"), column("b")]);
    const target_ = entity("gold_Target", [column("x"), column("y")]);
    const unusable = relationship({
      source: { entity: "datavault.gold_Bridge", columns: source },
      target: { entity: "datavault.gold_Target", columns: target },
    });

    const result = buildSelect(graph([bridge, target_], [unusable]), [
      "datavault.gold_Bridge",
      "datavault.gold_Target",
    ]);

    expect(result.sql).toBe(['SELECT *', 'FROM "datavault"."gold_Bridge" t1'].join("\n"));
    expect(result.warnings.map((warning) => warning.code)).toEqual(["disconnected"]);
  });

  it("drops a picked id that is not in the graph but still builds from the rest", () => {
    const result = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gone",
      "datavault.gold_DimDate",
    ]);

    expect(result.sql).toContain('JOIN "datavault"."gold_DimDate" t2');
    expect(result.included).toEqual([
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
    ]);
    expect(result.excluded).toEqual(["datavault.gone"]);

    const [warning] = result.warnings;
    expect(warning.code).toBe("unknown_entity");
    expect(warning.entityIds).toEqual(["datavault.gone"]);
    expect(warning.message).toContain("datavault.gone");
  });

  it("has nothing runnable when every picked id has left the diagram", () => {
    const result = buildSelect(STAR, ["datavault.gone"]);

    expect(result.sql).toBeNull();
    expect(result.warnings.map((warning) => warning.code)).toEqual(["unknown_entity"]);
    expect(result.excluded).toEqual(["datavault.gone"]);
  });

  it("spells identifiers with backticks against a Databricks source", () => {
    const result = buildSelect(graph([TX, DIM_DATE], [TX_DATE], "databricks"), [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
    ]);

    expect(result.sql).toBe(
      [
        "SELECT *",
        "FROM `datavault`.`gold_Golden1_AllTransactions` t1",
        "JOIN `datavault`.`gold_DimDate` t2 ON t1.`datesk` = t2.`datesk`",
      ].join("\n"),
    );
  });

  it("takes the override over the inferred edge for the same pair", () => {
    // No override logic here: infer.py returns overrides first, so taking the
    // first relationship joining a pair is already the precedence rule.
    const override = relationship({
      id: "ovr-1",
      origin: "admin_override",
      source: { entity: "datavault.gold_Golden1_AllTransactions", columns: ["datesk"] },
      target: { entity: "datavault.gold_DimDate", columns: ["datesk"] },
    });
    const inferred = relationship({
      id: "rel-guess",
      origin: "inferred_naming",
      confidence: 0.8,
      source: { entity: "datavault.gold_Golden1_AllTransactions", columns: ["categorysk"] },
      target: { entity: "datavault.gold_DimDate", columns: ["yearsk"] },
    });

    const result = buildSelect(graph([TX, DIM_DATE], [override, inferred]), [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
    ]);

    expect(result.sql).toContain('ON t1."datesk" = t2."datesk"');
    expect(result.sql).not.toContain("categorysk");
  });

  it("never bounds the query with a LIMIT or softens it to a LEFT JOIN", () => {
    // Omni-ERD does not run this - the user does, somewhere else - so a row cap
    // it did not ask for would change what the statement means.
    const result = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
    ]);

    expect(result.sql).not.toContain("LIMIT");
    expect(result.sql).not.toContain("LEFT");
  });

  it("populates joinGroups and suggestedBridges for a split selection, with joinGroups[0] matching included", () => {
    const result = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimYear",
    ]);

    expect(result.included).toEqual(["datavault.gold_Golden1_AllTransactions"]);
    expect(result.excluded).toEqual(["datavault.gold_DimYear"]);
    expect(result.joinGroups).toEqual([
      ["datavault.gold_Golden1_AllTransactions"],
      ["datavault.gold_DimYear"],
    ]);
    expect(result.joinGroups[0]).toEqual(result.included);
    expect(result.suggestedBridges.map((bridge) => bridge.entityId)).toEqual([
      "datavault.gold_DimDate",
    ]);
  });

  it("still reports exactly one disconnected warning for a split selection", () => {
    const result = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimYear",
    ]);

    expect(result.warnings.map((warning) => warning.code)).toEqual(["disconnected"]);
  });

  it("names the bridging table in the disconnected warning when one exists", () => {
    const result = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimYear",
    ]);

    expect(result.warnings[0].message).toContain("Add datavault.gold_DimDate");
  });

  it("does not call excluded picks unrelated when they join each other, only when they don't", () => {
    const extraA = entity("gold_ExtraA", [column("id")]);
    const extraB = entity("gold_ExtraB", [column("id")]);
    const linkAB = relationship({
      id: "rel-extra-ab",
      source: { entity: "datavault.gold_ExtraA", columns: ["id"] },
      target: { entity: "datavault.gold_ExtraB", columns: ["id"] },
    });

    const result = buildSelect(graph([TX, extraA, extraB], [linkAB]), [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_ExtraA",
      "datavault.gold_ExtraB",
    ]);

    expect(result.warnings[0].message).toContain("join each other but not");
    expect(result.warnings[0].message).not.toContain("no relationship to the tables in this query");
  });

  it("does not invent a remedy when no single table would bridge the gap", () => {
    const extraA = entity("gold_ExtraA", [column("id")]);
    const extraB = entity("gold_ExtraB", [column("id")]);
    const linkAB = relationship({
      id: "rel-extra-ab",
      source: { entity: "datavault.gold_ExtraA", columns: ["id"] },
      target: { entity: "datavault.gold_ExtraB", columns: ["id"] },
    });

    const result = buildSelect(graph([TX, extraA, extraB], [linkAB]), [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_ExtraA",
      "datavault.gold_ExtraB",
    ]);

    expect(result.suggestedBridges).toEqual([]);
    expect(result.warnings[0].message).not.toContain("Add ");
    expect(result.warnings[0].message).toContain("No single table in this diagram would connect");
  });

  it("keeps remedyBridge null when every suggested bridge misses the root group (Gap 1)", () => {
    // The only candidate bridge here connects the two non-root groups to each
    // other, never to gold_Root. suggestedBridges is therefore non-empty, but
    // remedyBridge must stay null - a `suggestedBridges[0] ?? null` refactor
    // would instead surface this bridge as the remedy, offering a control
    // whose "add it" does nothing to reach gold_Root, contradicting the
    // sentence that explains the gap.
    const root = entity("gold_Root", [column("id")]);
    const groupA = entity("gold_GroupA", [column("id")]);
    const groupB = entity("gold_GroupB", [column("id")]);
    const bridge = entity("gold_Bridge", [column("a_id"), column("b_id")]);

    const bridgeToA = relationship({
      id: "rel-bridge-a",
      source: { entity: "datavault.gold_Bridge", columns: ["a_id"] },
      target: { entity: "datavault.gold_GroupA", columns: ["id"] },
    });
    const bridgeToB = relationship({
      id: "rel-bridge-b",
      source: { entity: "datavault.gold_Bridge", columns: ["b_id"] },
      target: { entity: "datavault.gold_GroupB", columns: ["id"] },
    });

    const result = buildSelect(graph([root, groupA, groupB, bridge], [bridgeToA, bridgeToB]), [
      "datavault.gold_Root",
      "datavault.gold_GroupA",
      "datavault.gold_GroupB",
    ]);

    expect(result.suggestedBridges).toHaveLength(1);
    expect(result.suggestedBridges[0].entityId).toBe("datavault.gold_Bridge");
    expect(result.remedyBridge).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it("names only the group a partial bridge reconnects, not the whole excluded set (Gap 2)", () => {
    // Gap 2: three join groups, and the offered bridge only reaches one of the
    // two excluded groups. `remedySentence`'s `reconnected.length ===
    // excludedCount` check must take the false branch here and name
    // gold_GroupA specifically - every existing bridge fixture has exactly one
    // excluded group, where that check is trivially true and the pronoun path
    // is all that ever runs. This also exercises the `excludedGroups[index -
    // 1]` offset against a group index (1) that is not the trivial [0, 1]
    // case: an off-by-one here reads `excludedGroups[1]` instead and the
    // sentence would name gold_GroupB/gold_GroupC or print "undefined".
    const root = entity("gold_Root", [column("id")]);
    const groupA = entity("gold_GroupA", [column("id")]);
    const groupB = entity("gold_GroupB", [column("id")]);
    const groupC = entity("gold_GroupC", [column("b_id")]);
    const bridge = entity("gold_Bridge", [column("r_id"), column("a_id")]);

    const bridgeToRoot = relationship({
      id: "rel-bridge-root",
      source: { entity: "datavault.gold_Bridge", columns: ["r_id"] },
      target: { entity: "datavault.gold_Root", columns: ["id"] },
    });
    const bridgeToA = relationship({
      id: "rel-bridge-a",
      source: { entity: "datavault.gold_Bridge", columns: ["a_id"] },
      target: { entity: "datavault.gold_GroupA", columns: ["id"] },
    });
    const bToC = relationship({
      id: "rel-b-c",
      source: { entity: "datavault.gold_GroupC", columns: ["b_id"] },
      target: { entity: "datavault.gold_GroupB", columns: ["id"] },
    });

    const result = buildSelect(
      graph([root, groupA, groupB, groupC, bridge], [bridgeToRoot, bridgeToA, bToC]),
      [
        "datavault.gold_Root",
        "datavault.gold_GroupA",
        "datavault.gold_GroupB",
        "datavault.gold_GroupC",
      ],
    );

    expect(result.joinGroups).toEqual([
      ["datavault.gold_Root"],
      ["datavault.gold_GroupA"],
      ["datavault.gold_GroupB", "datavault.gold_GroupC"],
    ]);
    expect(result.remedyBridge?.entityId).toBe("datavault.gold_Bridge");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain(
      "Add datavault.gold_Bridge to connect datavault.gold_GroupA.",
    );
    expect(result.warnings[0].message).not.toContain("undefined");
    expect(result.warnings[0].message).not.toContain("connect them");
  });

  it("dedupes a repeated id, matching the result of picking it once (Gap 4)", () => {
    const once = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
    ]);
    const twice = buildSelect(STAR, [
      "datavault.gold_Golden1_AllTransactions",
      "datavault.gold_DimDate",
      "datavault.gold_Golden1_AllTransactions",
    ]);

    expect(twice.sql).toBe(once.sql);
    expect(twice.warnings).toEqual(once.warnings);
    expect(twice.included).toEqual(once.included);
    expect(twice.excluded).toEqual(once.excluded);
  });
});
