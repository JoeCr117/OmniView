import { describe, expect, it } from "vitest";

import type { BreakdownRow } from "./api";
import {
  NO_CROSS_FILTER,
  applyClick,
  describeSelection,
  highlightedKeys,
  isFiltered,
  matchesSelection,
  rowsFor,
  type CrossFilter,
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
  const fromPie: CrossFilter = { pie: [{ dim: "category", key: "Food" }] };

  it("filters the visuals that did not make the selection", () => {
    expect(rowsFor(ROWS, fromPie, "matrix")).toHaveLength(2);
    expect(rowsFor(ROWS, fromPie, "waterfall")).toHaveLength(2);
  });

  it("leaves the source visual whole, so it does not collapse to one slice", () => {
    expect(rowsFor(ROWS, fromPie, "pie")).toHaveLength(ROWS.length);
  });

  it("is a no-op with no selection", () => {
    expect(rowsFor(ROWS, NO_CROSS_FILTER, "matrix")).toBe(ROWS);
  });

  describe("with two visuals selected", () => {
    // The reference report's compound case: an account from the matrix, a year
    // from the waterfall, and the pie reduced by both.
    const compound: CrossFilter = {
      matrix: [{ dim: "accountType", key: "CreditCard" }],
      waterfall: [{ dim: "year", key: "2025" }],
    };
    const MIXED: BreakdownRow[] = [
      row("2024-01-01", "Food", "CreditCard"),
      row("2025-01-01", "Food", "CreditCard"),
      row("2025-02-01", "Rent", "FreeChecking"),
      row("2024-03-01", "Travel", "FreeChecking"),
    ];

    it("intersects them for a visual that made neither", () => {
      const seen = rowsFor(MIXED, compound, "pie");
      expect(seen).toHaveLength(1);
      expect(seen[0].calendar_date).toBe("2025-01-01");
    });

    it("exempts a visual from its OWN entry only, never from the other's", () => {
      // The matrix keeps every account (its own selection) but still loses the
      // years the waterfall excluded.
      const seen = rowsFor(MIXED, compound, "matrix");
      expect(seen.map((r) => r.account_type)).toEqual(["CreditCard", "FreeChecking"]);
      expect(seen.every((r) => r.calendar_date.startsWith("2025"))).toBe(true);
    });
  });
});

describe("highlightedKeys", () => {
  const filter: CrossFilter = { waterfall: [{ dim: "year", key: "2025" }] };

  it("dims only in the visual that made the selection", () => {
    expect(highlightedKeys(filter, "waterfall")).toEqual(["2025"]);
  });

  it("dims nothing elsewhere, because everything left there is in the selection", () => {
    expect(highlightedKeys(filter, "pie")).toEqual([]);
    expect(highlightedKeys(NO_CROSS_FILTER, "waterfall")).toEqual([]);
  });
});

describe("applyClick", () => {
  const food = { dim: "category", key: "Food" } as const;
  const rent = { dim: "category", key: "Rent" } as const;
  const card = { dim: "accountType", key: "CreditCard" } as const;

  it("selects a mark", () => {
    expect(applyClick(NO_CROSS_FILTER, "pie", food)).toEqual({ pie: [food] });
  });

  it("clears when the selected mark is clicked again", () => {
    expect(applyClick({ pie: [food] }, "pie", food)).toEqual(NO_CROSS_FILTER);
  });

  it("replaces the selection on a plain click elsewhere in the same visual", () => {
    expect(applyClick({ pie: [food] }, "pie", rent)).toEqual({ pie: [rent] });
  });

  it("extends with ctrl/shift", () => {
    expect(applyClick({ pie: [food] }, "pie", rent, true)).toEqual({ pie: [food, rent] });
  });

  it("removes a value from a multi-selection by extending onto it again", () => {
    expect(applyClick({ pie: [food, rent] }, "pie", rent, true)).toEqual({ pie: [food] });
  });

  it("drops a visual's entry entirely when its last value is removed", () => {
    expect(applyClick({ pie: [food] }, "pie", food, true)).toEqual(NO_CROSS_FILTER);
  });

  it("keeps the other visual's selection when extending into a new one", () => {
    // The gesture the reference image is built on: matrix, then ctrl-click the
    // waterfall, and both apply.
    expect(applyClick({ matrix: [card] }, "waterfall", food, true)).toEqual({
      matrix: [card],
      waterfall: [food],
    });
  });

  it("drops the other visual's selection on a PLAIN click, so one click resets to one filter", () => {
    expect(applyClick({ matrix: [card] }, "waterfall", food)).toEqual({ waterfall: [food] });
  });

  it("removing one visual's last value leaves the other visual selected", () => {
    const current: CrossFilter = { matrix: [card], waterfall: [food] };
    expect(applyClick(current, "waterfall", food, true)).toEqual({ matrix: [card] });
  });

  it("clears on a null criterion, which is how a visual reports empty space", () => {
    expect(applyClick({ pie: [food] }, "pie", null)).toEqual(NO_CROSS_FILTER);
  });

  it("does not mutate the filter it was given", () => {
    const current: CrossFilter = { matrix: [card] };
    applyClick(current, "waterfall", food, true);
    expect(current).toEqual({ matrix: [card] });
  });
});

describe("isFiltered", () => {
  it("is false for no selection, and for an emptied one", () => {
    expect(isFiltered(NO_CROSS_FILTER)).toBe(false);
    expect(isFiltered({ pie: [] })).toBe(false);
  });

  it("is true once any visual holds a selection", () => {
    expect(isFiltered({ pie: [{ dim: "category", key: "Food" }] })).toBe(true);
  });
});

describe("describeSelection", () => {
  it("names the selected values", () => {
    expect(
      describeSelection({
        pie: [
          { dim: "category", key: "Food" },
          { dim: "category", key: "Rent" },
        ],
      }),
    ).toBe("Food, Rent");
  });

  it("names values from every visual, so the chip accounts for the whole filter", () => {
    expect(
      describeSelection({
        matrix: [{ dim: "accountType", key: "CreditCard" }],
        waterfall: [{ dim: "year", key: "2024" }],
      }),
    ).toBe("CreditCard, 2024");
  });

  it("says nothing when nothing is selected", () => {
    expect(describeSelection(NO_CROSS_FILTER)).toBe("");
  });
});
