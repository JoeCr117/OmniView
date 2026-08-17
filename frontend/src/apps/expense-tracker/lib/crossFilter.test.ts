import { describe, expect, it } from "vitest";

import type { BreakdownRow } from "./api";
import {
  applyClick,
  describeSelection,
  highlightedKeys,
  matchesSelection,
  rowsFor,
  type Selection,
} from "./crossFilter";

function row(
  calendar_date: string,
  category: string,
  account_type = "CreditCard",
  amount = -10,
): BreakdownRow {
  return {
    date_sk: Number(calendar_date.replaceAll("-", "")),
    calendar_date,
    account_type,
    category,
    sub_category: `${category}Sub`,
    label: `${category}Label`,
    amount,
  };
}

const ROWS: BreakdownRow[] = [
  row("2024-01-01", "Food"),
  row("2025-01-01", "Food"),
  row("2025-02-01", "Rent"),
  row("2025-03-01", "Travel"),
];

describe("matchesSelection", () => {
  it("ORs several values of one dimension", () => {
    const criteria = [
      { dim: "category", key: "Food" },
      { dim: "category", key: "Rent" },
    ] as const;
    expect(ROWS.filter((r) => matchesSelection(r, criteria)).map((r) => r.category)).toEqual([
      "Food",
      "Food",
      "Rent",
    ]);
  });

  it("ANDs across different dimensions", () => {
    const criteria = [
      { dim: "category", key: "Food" },
      { dim: "year", key: "2025" },
    ] as const;
    expect(ROWS.filter((r) => matchesSelection(r, criteria))).toHaveLength(1);
  });

  it("matches everything when nothing is selected", () => {
    expect(ROWS.every((r) => matchesSelection(r, []))).toBe(true);
  });
});

describe("rowsFor", () => {
  const selection: Selection = { source: "pie", criteria: [{ dim: "category", key: "Food" }] };

  it("filters the visuals that did not make the selection", () => {
    expect(rowsFor(ROWS, selection, "matrix")).toHaveLength(2);
    expect(rowsFor(ROWS, selection, "waterfall")).toHaveLength(2);
  });

  it("leaves the source visual whole, so it does not collapse to one slice", () => {
    expect(rowsFor(ROWS, selection, "pie")).toHaveLength(ROWS.length);
  });

  it("is a no-op with no selection", () => {
    expect(rowsFor(ROWS, null, "matrix")).toBe(ROWS);
  });
});

describe("highlightedKeys", () => {
  const selection: Selection = { source: "waterfall", criteria: [{ dim: "year", key: "2025" }] };

  it("dims only in the visual that made the selection", () => {
    expect(highlightedKeys(selection, "waterfall")).toEqual(["2025"]);
  });

  it("dims nothing elsewhere, because everything left there is in the selection", () => {
    expect(highlightedKeys(selection, "pie")).toEqual([]);
    expect(highlightedKeys(null, "waterfall")).toEqual([]);
  });
});

describe("applyClick", () => {
  const food = { dim: "category", key: "Food" } as const;
  const rent = { dim: "category", key: "Rent" } as const;

  it("selects a mark", () => {
    expect(applyClick(null, "pie", food)).toEqual({ source: "pie", criteria: [food] });
  });

  it("clears when the selected mark is clicked again", () => {
    const current: Selection = { source: "pie", criteria: [food] };
    expect(applyClick(current, "pie", food)).toBeNull();
  });

  it("replaces the selection on a plain click elsewhere in the same visual", () => {
    const current: Selection = { source: "pie", criteria: [food] };
    expect(applyClick(current, "pie", rent)).toEqual({ source: "pie", criteria: [rent] });
  });

  it("extends with ctrl/shift", () => {
    const current: Selection = { source: "pie", criteria: [food] };
    expect(applyClick(current, "pie", rent, true)).toEqual({
      source: "pie",
      criteria: [food, rent],
    });
  });

  it("removes a value from a multi-selection by extending onto it again", () => {
    const current: Selection = { source: "pie", criteria: [food, rent] };
    expect(applyClick(current, "pie", rent, true)).toEqual({ source: "pie", criteria: [food] });
  });

  it("clears when the last value of a multi-selection is removed", () => {
    const current: Selection = { source: "pie", criteria: [food] };
    expect(applyClick(current, "pie", food, true)).toBeNull();
  });

  it("starts fresh when the click comes from a different visual", () => {
    const current: Selection = { source: "pie", criteria: [food] };
    expect(applyClick(current, "waterfall", rent, true)).toEqual({
      source: "waterfall",
      criteria: [rent],
    });
  });

  it("clears on a null criterion, which is how a visual reports empty space", () => {
    const current: Selection = { source: "pie", criteria: [food] };
    expect(applyClick(current, "pie", null)).toBeNull();
  });
});

describe("describeSelection", () => {
  it("names the selected values", () => {
    expect(
      describeSelection({
        source: "pie",
        criteria: [
          { dim: "category", key: "Food" },
          { dim: "category", key: "Rent" },
        ],
      }),
    ).toBe("Food, Rent");
  });

  it("says nothing when nothing is selected", () => {
    expect(describeSelection(null)).toBe("");
  });
});
