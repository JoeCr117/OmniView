import { describe, expect, it } from "vitest";

import { joinCondition, relationName } from "./overrideText";

describe("relationName", () => {
  it("drops the namespace every row on the page shares", () => {
    expect(relationName("datavault.gold_DimDate")).toBe("gold_DimDate");
  });

  it("leaves an unqualified id alone", () => {
    expect(relationName("auth_group")).toBe("auth_group");
  });

  it("keeps only the last segment of a deeper id", () => {
    expect(relationName("catalog.schema.gold_DimDate")).toBe("gold_DimDate");
  });
});

describe("joinCondition", () => {
  it("reads as the equality SQL would write", () => {
    expect(joinCondition("datavault.a_fact", ["datesk"], "datavault.z_dim", ["datesk"])).toBe(
      "a_fact.datesk = z_dim.datesk",
    );
  });

  it("joins a composite key's pairs with AND, positionally", () => {
    expect(
      joinCondition(
        "datavault.a_fact",
        ["datesk", "accountsk"],
        "datavault.z_dim",
        ["datesk", "accountsk"],
      ),
    ).toBe("a_fact.datesk = z_dim.datesk AND a_fact.accountsk = z_dim.accountsk");
  });

  it("does not re-case an identifier", () => {
    expect(joinCondition("datavault.Fact", ["DateSK"], "datavault.Dim", ["datesk"])).toBe(
      "Fact.DateSK = Dim.datesk",
    );
  });

  it("marks a missing counterpart rather than reading as complete", () => {
    expect(
      joinCondition("datavault.a_fact", ["datesk", "accountsk"], "datavault.z_dim", ["datesk"]),
    ).toBe("a_fact.datesk = z_dim.datesk AND a_fact.accountsk = z_dim.?");
  });

  it("is empty when a side names no columns, which is what a suppress stores", () => {
    expect(joinCondition("datavault.a_fact", [], "datavault.z_dim", [])).toBe("");
  });
});
