import { describe, expect, it } from "vitest";

import { toggle } from "./selection";

describe("toggle", () => {
  it("appends a new id to the end, preserving pick order", () => {
    expect(toggle(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("removes an id that is already selected", () => {
    expect(toggle(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("starts a selection from empty", () => {
    expect(toggle([], "a")).toEqual(["a"]);
  });

  it("empties when the last remaining id is toggled off", () => {
    expect(toggle(["a"], "a")).toEqual([]);
  });

  it("does not mutate its input", () => {
    const input = ["a", "b"];
    toggle(input, "c");
    toggle(input, "a");
    expect(input).toEqual(["a", "b"]);
  });
});
