import { describe, expect, it } from "vitest";

import { buildIndex, searchEntries } from "./searchIndex";
import type { Column, Entity, SchemaGraph } from "./types";

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

function entity(name: string, columns: Column[]): Entity {
  return {
    id: `datavault.${name}`,
    namespace: "datavault",
    name,
    kind: "table",
    comment: null,
    columns,
    primary_key: null,
    unique: [],
  };
}

function graph(entities: Entity[]): SchemaGraph {
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
    relationships: [],
  };
}

const G = graph([
  entity("gold_DimDate", [column("datesk"), column("year")]),
  entity("facts", [column("datesk")]),
]);

describe("buildIndex", () => {
  it("indexes every table and every column", () => {
    const index = buildIndex(G);

    expect(index.filter((e) => e.kind === "table")).toHaveLength(2);
    expect(index.filter((e) => e.kind === "column")).toHaveLength(3);
  });

  it("puts tables before columns, so a table name is not buried under its own columns", () => {
    const kinds = buildIndex(G).map((e) => e.kind);
    const lastTable = kinds.lastIndexOf("table");
    const firstColumn = kinds.indexOf("column");

    expect(lastTable).toBeLessThan(firstColumn);
  });

  it("gives every entry a unique key", () => {
    // Two tables share a `datesk` column; without the table in the key they
    // would collide and React would drop one.
    const keys = buildIndex(G).map((e) => e.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes the table name in a column's search text", () => {
    // Fifteen tables carry `datesk` in the real schema, so the table name is
    // the only thing that tells them apart when typing.
    const entry = buildIndex(G).find((e) => e.key === "c:datavault.facts.datesk")!;

    expect(entry.searchText).toContain("datesk");
    expect(entry.searchText).toContain("facts");
  });

  it("carries the entity id, so a hit can be located on the canvas", () => {
    const entry = buildIndex(G).find((e) => e.kind === "table")!;
    expect(entry.entityId).toBe("datavault.gold_DimDate");
  });

  it("labels a column with its normalised type, not its raw one", () => {
    const entry = buildIndex(G).find((e) => e.kind === "column")!;
    expect(entry.typeLabel).toBe("integer");
  });

  it("handles a table with no columns", () => {
    const index = buildIndex(graph([entity("empty", [])]));
    expect(index).toHaveLength(1);
  });
});

describe("searchEntries", () => {
  /** Wide enough that the interesting columns sit well past any display cap. */
  const WIDE = buildIndex(
    graph([
      entity(
        "budgets_budgetmapdocument",
        [...Array.from({ length: 60 }, (_, i) => column(`filler_${i}`)), column("bank")],
      ),
      entity("django_content_type", [column("id"), column("app_label"), column("model")]),
      entity("gold_DimDate", [column("datesk")]),
      entity("facts", [column("datesk")]),
    ]),
  );

  const names = (query: string) =>
    searchEntries(WIDE, query).map((e) => (e.columnName ? `${e.entityName}.${e.columnName}` : e.entityName));

  // The regression this function exists for. The first implementation capped
  // the *input* at 40 entries, so any column past that in catalog order was
  // unreachable no matter what you typed.
  it("finds a column that sits far past the display cap", () => {
    expect(names("bank")).toContain("budgets_budgetmapdocument.bank");
  });

  it("finds a column whose name is an exact query", () => {
    expect(names("app_label")).toContain("django_content_type.app_label");
  });

  it("matches on a snake_case word boundary", () => {
    // `label` should reach `app_label`; a plain prefix match would not.
    expect(names("label")).toContain("django_content_type.app_label");
  });

  it("requires every token to match, so a second word narrows", () => {
    const both = names("datesk dimdate");

    expect(both).toContain("gold_DimDate.datesk");
    expect(both).not.toContain("facts.datesk");
  });

  it("ranks a table above its own columns", () => {
    const results = names("django_content_type");
    expect(results[0]).toBe("django_content_type");
  });

  it("ranks an exact column name above an incidental substring", () => {
    expect(names("bank")[0]).toBe("budgets_budgetmapdocument.bank");
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(searchEntries(WIDE, "")).toEqual([]);
    expect(searchEntries(WIDE, "   ")).toEqual([]);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchEntries(WIDE, "zzzznope")).toEqual([]);
  });

  it("is case insensitive", () => {
    expect(names("APP_LABEL")).toContain("django_content_type.app_label");
  });

  /**
   * The ordering rules, pinned against input that already contradicts them.
   *
   * The earlier ranking tests pass whether or not `searchEntries` sorts at all,
   * because `buildIndex` happens to emit tables before columns and mostly in
   * ascending score order - so the unsorted list satisfies them by accident.
   * Mutation testing is what exposed that: deleting the entire `scored.sort(...)`
   * call killed no test. Each case below is built so the *input* order is the
   * opposite of the expected output.
   */
  describe("ordering", () => {
    it("puts a higher score first even when it arrives last", () => {
      // "dd" is a bare substring of "adder" (40) and a prefix of "dd_exact"
      // (80), and the weaker match is indexed first.
      const index = buildIndex(graph([entity("adder", []), entity("dd_exact", [])]));

      const names = searchEntries(index, "dd").map((e) => e.entityName);

      expect(names).toEqual(["dd_exact", "adder"]);
    });

    it("puts a table before a column when the column is indexed first", () => {
      // "shared" scores 100 on both: an exact table name and an exact column
      // name. The owning table is listed second so input order cannot carry it.
      const index = buildIndex(
        graph([entity("other", [column("shared")]), entity("shared", [])]),
      );

      const kinds = searchEntries(index, "shared").map((e) => e.kind);

      expect(kinds[0]).toBe("table");
    });

    it("breaks a remaining tie by key, not by catalog order", () => {
      // Two tables, equal score, deliberately indexed in reverse key order.
      const index = buildIndex(graph([entity("zzz_match", []), entity("aaa_match", [])]));

      const names = searchEntries(index, "match").map((e) => e.entityName);

      expect(names).toEqual(["aaa_match", "zzz_match"]);
    });

    it("applies the cap to the ranked list, so the best match survives it", () => {
      // 60 weak substring matches indexed before one exact match: with the cap
      // applied to an unranked list the exact hit would be cut.
      const weak = Array.from({ length: 60 }, (_, i) => entity(`pre_hit_${i}`, []));
      const index = buildIndex(graph([...weak, entity("hit", [])]));

      const names = searchEntries(index, "hit", 5).map((e) => e.entityName);

      expect(names[0]).toBe("hit");
      expect(names).toHaveLength(5);
    });
  });

  it("caps the result count after filtering, not before", () => {
    // 60 filler columns match, but only the cap is returned - and the cap is
    // applied to matches, so nothing is excluded from consideration.
    const results = searchEntries(WIDE, "filler", 5);
    expect(results).toHaveLength(5);
    expect(searchEntries(WIDE, "filler").length).toBeGreaterThan(5);
  });
});
