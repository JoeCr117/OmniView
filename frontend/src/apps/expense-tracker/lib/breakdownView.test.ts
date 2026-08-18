import { describe, expect, it } from "vitest";

import { INITIAL_VIEW, isDefaultView, type BreakdownView } from "./breakdownView";
import { drillInto, skipToNextLevel } from "./drill";
import { DATE_HIERARCHY, MATRIX_HIERARCHY } from "./breakdown";

const DRILLED = drillInto(INITIAL_VIEW.matrix.drill, MATRIX_HIERARCHY, "2024-01-01");

/**
 * One departure from the default per entry, so the table below reads as "these
 * are the things Restart exists to undo".
 *
 * The original defect was a Restart button whose enabled test knew about three
 * of these and not the other eight, so the interesting assertion is not that any
 * single one works - it is that **every** one is covered. The list is written
 * out by hand rather than generated, because a generator would derive itself
 * from the same shape `isDefaultView` walks and could not catch a field the
 * predicate forgot.
 */
const DEPARTURES: Record<string, BreakdownView> = {
  "a year slicer": { ...INITIAL_VIEW, years: new Set(["2024"]) },
  "a month slicer": { ...INITIAL_VIEW, months: new Set([1]) },
  "a cross-filter": {
    ...INITIAL_VIEW,
    filter: { matrix: [{ dim: "accountType", key: "CreditCard" }] },
  },
  "a matrix drill": { ...INITIAL_VIEW, matrix: { ...INITIAL_VIEW.matrix, drill: DRILLED } },
  "matrix drill mode": { ...INITIAL_VIEW, matrix: { ...INITIAL_VIEW.matrix, drillMode: true } },
  "matrix expand-all": { ...INITIAL_VIEW, matrix: { ...INITIAL_VIEW.matrix, expandAll: true } },
  "the waterfall axis": {
    ...INITIAL_VIEW,
    waterfall: { ...INITIAL_VIEW.waterfall, axis: "category" },
  },
  "a waterfall date drill": {
    ...INITIAL_VIEW,
    waterfall: {
      ...INITIAL_VIEW.waterfall,
      drills: {
        ...INITIAL_VIEW.waterfall.drills,
        date: drillInto(INITIAL_VIEW.waterfall.drills.date, DATE_HIERARCHY, "2024"),
      },
    },
  },
  "a waterfall category drill": {
    ...INITIAL_VIEW,
    waterfall: {
      ...INITIAL_VIEW.waterfall,
      drills: {
        ...INITIAL_VIEW.waterfall.drills,
        category: skipToNextLevel(INITIAL_VIEW.waterfall.drills.category, DATE_HIERARCHY),
      },
    },
  },
  "waterfall drill mode": {
    ...INITIAL_VIEW,
    waterfall: { ...INITIAL_VIEW.waterfall, drillMode: true },
  },
  "a pie drill": { ...INITIAL_VIEW, pie: { ...INITIAL_VIEW.pie, drill: DRILLED } },
  "pie drill mode": { ...INITIAL_VIEW, pie: { ...INITIAL_VIEW.pie, drillMode: true } },
};

describe("isDefaultView", () => {
  it("is true for the view the page opens with", () => {
    expect(isDefaultView(INITIAL_VIEW)).toBe(true);
  });

  it.each(Object.keys(DEPARTURES))("is false once there is %s", (name) => {
    expect(isDefaultView(DEPARTURES[name])).toBe(false);
  });

  it("covers every field of the view", () => {
    // The predicate's failure mode is silence: a field it forgets simply never
    // enables Restart, exactly as a drill never did. This pins the count so
    // adding a field to BreakdownView without a departure case fails here
    // rather than in someone's hands.
    const covered = new Set(
      Object.values(DEPARTURES).flatMap((view) =>
        (Object.keys(view) as (keyof BreakdownView)[]).filter(
          (field) => view[field] !== INITIAL_VIEW[field],
        ),
      ),
    );
    expect([...covered].sort()).toEqual(
      (Object.keys(INITIAL_VIEW) as (keyof BreakdownView)[]).sort(),
    );
  });

  it("a skipped level counts as drilled, because it is not the top level", () => {
    // Going to the next level filters nothing, but it does move the visual off
    // the level the bookmark restores - so Restart must offer to undo it.
    const skipped: BreakdownView = {
      ...INITIAL_VIEW,
      pie: { ...INITIAL_VIEW.pie, drill: skipToNextLevel(INITIAL_VIEW.pie.drill, DATE_HIERARCHY) },
    };
    expect(isDefaultView(skipped)).toBe(false);
  });

  it("an emptied cross-filter is not a filter", () => {
    // applyClick drops a visual's key when its last value goes, but a caller
    // holding `{pie: []}` must not leave Restart enabled forever.
    expect(isDefaultView({ ...INITIAL_VIEW, filter: { pie: [] } })).toBe(true);
  });
});
