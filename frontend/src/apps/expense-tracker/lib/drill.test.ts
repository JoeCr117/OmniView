import { describe, expect, it } from "vitest";

import { CATEGORY_HIERARCHY, DATE_HIERARCHY, MATRIX_HIERARCHY } from "./breakdown";
import {
  INITIAL_DRILL,
  canDrillDown,
  canDrillUp,
  currentDimension,
  drillFilter,
  drillInto,
  drillLevel,
  drillTitle,
  drillUp,
  skipToNextLevel,
} from "./drill";

describe("descending", () => {
  it("starts at the top of the hierarchy, filtering nothing", () => {
    expect(drillLevel(INITIAL_DRILL)).toBe(0);
    expect(currentDimension(INITIAL_DRILL, DATE_HIERARCHY)).toBe("year");
    expect(drillFilter(INITIAL_DRILL)).toEqual([]);
  });

  it("drilling into a mark descends and filters to it", () => {
    const state = drillInto(INITIAL_DRILL, DATE_HIERARCHY, "2025");
    expect(currentDimension(state, DATE_HIERARCHY)).toBe("month");
    expect(drillFilter(state)).toEqual([{ dim: "year", key: "2025" }]);
  });

  it("going to the next level descends without filtering", () => {
    const state = skipToNextLevel(INITIAL_DRILL, DATE_HIERARCHY);
    expect(currentDimension(state, DATE_HIERARCHY)).toBe("month");
    expect(drillFilter(state)).toEqual([]);
  });

  it("stops at the bottom of the hierarchy", () => {
    const bottom = skipToNextLevel(skipToNextLevel(INITIAL_DRILL, DATE_HIERARCHY), DATE_HIERARCHY);
    expect(currentDimension(bottom, DATE_HIERARCHY)).toBe("day");
    expect(canDrillDown(bottom, DATE_HIERARCHY)).toBe(false);
    expect(skipToNextLevel(bottom, DATE_HIERARCHY)).toBe(bottom);
    expect(drillInto(bottom, DATE_HIERARCHY, "05")).toBe(bottom);
  });

  it("accumulates a filter per level drilled into", () => {
    const state = drillInto(
      drillInto(INITIAL_DRILL, CATEGORY_HIERARCHY, "Food"),
      CATEGORY_HIERARCHY,
      "FastFood",
    );
    expect(drillFilter(state)).toEqual([
      { dim: "category", key: "Food" },
      { dim: "subCategory", key: "FastFood" },
    ]);
    expect(currentDimension(state, CATEGORY_HIERARCHY)).toBe("label");
  });
});

describe("drilling up", () => {
  it("is a no-op at the top", () => {
    expect(canDrillUp(INITIAL_DRILL)).toBe(false);
    expect(drillUp(INITIAL_DRILL)).toBe(INITIAL_DRILL);
  });

  it("undoes the last step, whichever kind it was", () => {
    const drilled = drillInto(INITIAL_DRILL, DATE_HIERARCHY, "2025");
    const skipped = skipToNextLevel(drilled, DATE_HIERARCHY);
    expect(drillLevel(skipped)).toBe(2);

    const back = drillUp(skipped);
    expect(drillLevel(back)).toBe(1);
    expect(drillFilter(back)).toEqual([{ dim: "year", key: "2025" }]);

    expect(drillFilter(drillUp(back))).toEqual([]);
  });
});

describe("drillTitle", () => {
  it("names just the level at the top", () => {
    expect(drillTitle("Transactions", INITIAL_DRILL, DATE_HIERARCHY)).toBe("Transactions by Year");
  });

  it("keeps the level drilled through, so a filtered view says so", () => {
    const state = drillInto(INITIAL_DRILL, DATE_HIERARCHY, "2025");
    expect(drillTitle("Transactions", state, DATE_HIERARCHY)).toBe(
      "Transactions by Year and Month",
    );
  });

  it("forgets a level that was skipped, because nothing was filtered by it", () => {
    const state = skipToNextLevel(INITIAL_DRILL, DATE_HIERARCHY);
    expect(drillTitle("Transactions", state, DATE_HIERARCHY)).toBe("Transactions by Month");
  });

  it("lists three levels the way the source report does", () => {
    const state = drillInto(
      drillInto(INITIAL_DRILL, CATEGORY_HIERARCHY, "Food"),
      CATEGORY_HIERARCHY,
      "FastFood",
    );
    expect(drillTitle("Expenses", state, CATEGORY_HIERARCHY)).toBe(
      "Expenses by Category, SubCategory and Label",
    );
  });

  it("drops the trailing level once past the bottom of a two-level hierarchy", () => {
    const bottom = skipToNextLevel(INITIAL_DRILL, MATRIX_HIERARCHY);
    expect(drillTitle("Transactions", bottom, MATRIX_HIERARCHY)).toBe("Transactions by Label");
  });
});
