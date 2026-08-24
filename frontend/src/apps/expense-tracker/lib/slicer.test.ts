import { describe, expect, it } from "vitest";

import { inSlicerScope, monthsInYears, slicerPick, yearsIn } from "./slicer";

const DATES = ["2024-01-15", "2024-03-02", "2025-01-09", "2025-11-30"];

describe("yearsIn", () => {
  it("lists each year once, ascending", () => {
    expect(yearsIn(DATES)).toEqual(["2024", "2025"]);
  });

  it("treats missing data as no years", () => {
    expect(yearsIn(null)).toEqual([]);
    expect(yearsIn(undefined)).toEqual([]);
  });
});

describe("monthsInYears", () => {
  it("returns months only from the selected years", () => {
    expect([...monthsInYears(DATES, new Set(["2025"]))].sort()).toEqual([1, 11]);
  });

  it("treats an empty selection as all years, not none", () => {
    expect([...monthsInYears(DATES, new Set())].sort((a, b) => a - b)).toEqual([1, 3, 11]);
  });
});

describe("inSlicerScope", () => {
  const noYears = new Set<string>();
  const noMonths = new Set<number>();

  it("passes everything when nothing is selected", () => {
    expect(inSlicerScope("2024-01-15", noYears, noMonths)).toBe(true);
  });

  it("requires both year and month when both are selected", () => {
    const y2025 = new Set(["2025"]);
    const january = new Set([1]);
    expect(inSlicerScope("2025-01-09", y2025, january)).toBe(true);
    expect(inSlicerScope("2024-01-15", y2025, january)).toBe(false);
    expect(inSlicerScope("2025-11-30", y2025, january)).toBe(false);
  });
});

describe("slicerPick", () => {
  it("selects just the clicked value", () => {
    expect([...slicerPick(new Set(["a", "b"]), "c", false)]).toEqual(["c"]);
  });

  it("clears when the only selected value is clicked again", () => {
    expect([...slicerPick(new Set(["a"]), "a", false)]).toEqual([]);
  });

  it("keeps a multi-selection intact when re-clicking one of several", () => {
    expect([...slicerPick(new Set(["a", "b"]), "a", false)]).toEqual(["a"]);
  });

  it("toggles in and out when extending", () => {
    expect([...slicerPick(new Set(["a"]), "b", true)].sort()).toEqual(["a", "b"]);
    expect([...slicerPick(new Set(["a", "b"]), "b", true)]).toEqual(["a"]);
  });

  it("never mutates the set it is given", () => {
    const original = new Set(["a"]);
    slicerPick(original, "b", true);
    expect([...original]).toEqual(["a"]);
  });
});
