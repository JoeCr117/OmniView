import { describe, expect, it } from "vitest";

import type { BreakdownRow } from "./api";
import {
  CATEGORY_HIERARCHY,
  DATE_HIERARCHY,
  MATRIX_HIERARCHY,
  WATERFALL_TOTAL_KEY,
  dimensionKey,
  dimensionLabel,
  filterRows,
  keysPresent,
  matches,
  netOf,
  pieSlices,
  pivot,
  waterfall,
} from "./breakdown";

function row(
  calendar_date: string,
  account_type: string,
  category: string,
  sub_category: string,
  label: string,
  amount: number,
): BreakdownRow {
  return {
    date_sk: Number(calendar_date.replaceAll("-", "")),
    calendar_date,
    account_type,
    category,
    sub_category,
    label,
    amount,
  };
}

const ROWS: BreakdownRow[] = [
  row("2024-01-15", "CreditCard", "Food", "FastFood", "TACO BELL", -10),
  row("2024-02-20", "CreditCard", "Food", "Dining", "SUSHI", -30),
  row("2024-02-20", "FreeChecking", "Rent", "Rent", "APTS", -1000),
  row("2025-01-10", "FreeChecking", "Income", "Paycheck", "Employer", 2000),
  row("2025-01-10", "CreditCard", "Food", "FastFood", "TACO BELL", -20),
];

describe("dimensionKey", () => {
  it("derives date parts by slicing, with keys that sort as strings", () => {
    const [first] = ROWS;
    expect(dimensionKey(first, "year")).toBe("2024");
    expect(dimensionKey(first, "month")).toBe("01");
    expect(dimensionKey(first, "day")).toBe("15");
    expect(dimensionKey(first, "date")).toBe("2024-01-15");
  });

  it("reads the categorical dimensions straight off the row", () => {
    const [first] = ROWS;
    expect(dimensionKey(first, "accountType")).toBe("CreditCard");
    expect(dimensionKey(first, "category")).toBe("Food");
    expect(dimensionKey(first, "subCategory")).toBe("FastFood");
    expect(dimensionKey(first, "label")).toBe("TACO BELL");
  });
});

describe("dimensionLabel", () => {
  it("names months and strips the leading zero from days", () => {
    expect(dimensionLabel("month", "02")).toBe("February");
    expect(dimensionLabel("day", "05")).toBe("5");
  });

  it("passes other dimensions through unchanged", () => {
    expect(dimensionLabel("category", "Food")).toBe("Food");
    expect(dimensionLabel("year", "2024")).toBe("2024");
  });
});

describe("netOf", () => {
  it("sums to the cent rather than leaving float dust behind", () => {
    const cents = [
      row("2024-01-01", "CreditCard", "Food", "FastFood", "A", 0.1),
      row("2024-01-01", "CreditCard", "Food", "FastFood", "B", 0.2),
    ];
    expect(netOf(cents)).toBe(0.3);
  });

  it("nets income against spend", () => {
    expect(netOf(ROWS)).toBe(940);
  });
});

describe("keysPresent", () => {
  it("lists the live keys for a dimension, ascending", () => {
    expect(keysPresent(ROWS, "accountType")).toEqual(["CreditCard", "FreeChecking"]);
  });

  it("drops columns that the current rows do not use", () => {
    const cardOnly = ROWS.filter((r) => r.account_type === "CreditCard");
    expect(keysPresent(cardOnly, "accountType")).toEqual(["CreditCard"]);
  });
});

describe("matches / filterRows", () => {
  it("requires every criterion in the path", () => {
    const path = [
      { dim: "year", key: "2024" },
      { dim: "category", key: "Food" },
    ] as const;
    expect(matches(ROWS[0], path)).toBe(true);
    expect(matches(ROWS[3], path)).toBe(false);
  });

  it("treats an empty path as no filter", () => {
    expect(filterRows(ROWS, [])).toHaveLength(ROWS.length);
  });

  it("filters down a drill path", () => {
    const filtered = filterRows(ROWS, [
      { dim: "category", key: "Food" },
      { dim: "subCategory", key: "FastFood" },
    ]);
    expect(filtered.map((r) => r.amount)).toEqual([-10, -20]);
  });
});

describe("pivot", () => {
  const nodes = pivot(ROWS, MATRIX_HIERARCHY, "accountType");

  it("reads newest date first, like a statement", () => {
    expect(nodes.map((n) => n.key)).toEqual(["2025-01-10", "2024-02-20", "2024-01-15"]);
  });

  it("splits each row into its per-column nets and a row total", () => {
    const feb = nodes.find((n) => n.key === "2024-02-20");
    expect(feb?.values).toEqual({ CreditCard: -30, FreeChecking: -1000 });
    expect(feb?.total).toBe(-1030);
  });

  it("omits columns a row has no data for, leaving the cell blank", () => {
    const jan = nodes.find((n) => n.key === "2024-01-15");
    expect(jan?.values).toEqual({ CreditCard: -10 });
    expect(jan?.values.FreeChecking).toBeUndefined();
  });

  it("carries the next hierarchy level as children", () => {
    const feb = nodes.find((n) => n.key === "2024-02-20");
    expect(feb?._children?.map((c) => c.label).sort()).toEqual(["APTS", "SUSHI"]);
  });

  it("gives every node a tree-unique id, so a label repeating under two parents does not collide", () => {
    const ids = nodes.flatMap((n) => [n.id, ...(n._children ?? []).map((c) => c.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("2024-01-15/TACO BELL");
    expect(ids).toContain("2025-01-10/TACO BELL");
  });

  it("stops at the last row dimension", () => {
    const flat = pivot(ROWS, ["category"], "accountType");
    expect(flat.every((n) => n._children === undefined)).toBe(true);
    expect(flat.map((n) => n.key)).toEqual(["Food", "Income", "Rent"]);
  });

  it("totals across the whole tree to the same net as the rows", () => {
    expect(netOf(ROWS)).toBe(nodes.reduce((sum, n) => sum + n.total, 0));
  });

  it("returns nothing for no rows and no dimensions", () => {
    expect(pivot([], MATRIX_HIERARCHY, "accountType")).toEqual([]);
    expect(pivot(ROWS, [], "accountType")).toEqual([]);
  });
});

describe("waterfall", () => {
  const bars = waterfall(ROWS, "year");

  it("runs ascending so time reads left to right", () => {
    expect(bars.map((b) => b.key)).toEqual(["2024", "2025", WATERFALL_TOTAL_KEY]);
  });

  it("floats each bar between the running totals either side of it", () => {
    expect(bars[0]).toMatchObject({ start: 0, delta: -1040, end: -1040 });
    expect(bars[1]).toMatchObject({ start: -1040, delta: 1980, end: 940 });
  });

  it("chains, so no bar starts anywhere but where the last one ended", () => {
    const steps = bars.filter((b) => b.kind !== "total");
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i].start).toBe(steps[i - 1].end);
    }
  });

  it("colours by sign", () => {
    expect(bars[0].kind).toBe("decrease");
    expect(bars[1].kind).toBe("increase");
  });

  it("closes with a Total bar spanning zero to the net", () => {
    const total = bars.at(-1);
    expect(total).toMatchObject({ kind: "total", label: "Total", start: 0, delta: 940, end: 940 });
  });

  it("labels a month axis with month names", () => {
    expect(waterfall(ROWS, "month").map((b) => b.label)).toEqual([
      "January",
      "February",
      "Total",
    ]);
  });

  it("has no total bar to draw when there are no rows", () => {
    expect(waterfall([], "year")).toEqual([]);
  });
});

describe("pieSlices", () => {
  const slices = pieSlices(ROWS, "category");

  it("shows spend as a positive magnitude, largest first", () => {
    expect(slices.map((s) => [s.label, s.value])).toEqual([
      ["Rent", 1000],
      ["Food", 60],
    ]);
  });

  it("excludes groups that net positive, so Income is never drawn as spend", () => {
    expect(slices.map((s) => s.key)).not.toContain("Income");
  });

  it("gives percentages of what is shown, totalling 100", () => {
    expect(slices.reduce((sum, s) => sum + s.pct, 0)).toBeCloseTo(100, 6);
    expect(slices[0].pct).toBeCloseTo(94.34, 2);
  });

  it("drills to the level asked for", () => {
    const food = filterRows(ROWS, [{ dim: "category", key: "Food" }]);
    expect(pieSlices(food, "subCategory").map((s) => [s.label, s.value])).toEqual([
      ["FastFood", 30],
      ["Dining", 30],
    ]);
  });

  it("has nothing to draw when there is no spend", () => {
    const incomeOnly = ROWS.filter((r) => r.amount > 0);
    expect(pieSlices(incomeOnly, "category")).toEqual([]);
    expect(pieSlices([], "category")).toEqual([]);
  });
});

describe("hierarchies", () => {
  it("declares the drill paths the visuals descend", () => {
    expect(DATE_HIERARCHY).toEqual(["year", "month", "day"]);
    expect(CATEGORY_HIERARCHY).toEqual(["category", "subCategory", "label"]);
    expect(MATRIX_HIERARCHY).toEqual(["date", "label"]);
  });
});
