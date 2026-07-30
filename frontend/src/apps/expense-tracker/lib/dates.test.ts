import { describe, expect, it } from "vitest";

import { dateSorter, parseDateValue, toIsoDate } from "./dates";

describe("parseDateValue", () => {
  it("parses ISO YYYY-MM-DD", () => {
    expect(parseDateValue("2024-01-03")).toBe(Date.UTC(2024, 0, 3));
  });

  it("parses US MM/DD/YYYY, including single digits", () => {
    expect(parseDateValue("01/03/2024")).toBe(Date.UTC(2024, 0, 3));
    expect(parseDateValue("1/3/2024")).toBe(Date.UTC(2024, 0, 3));
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseDateValue(" 2024-01-03 ")).toBe(Date.UTC(2024, 0, 3));
  });

  it("rejects out-of-range month/day", () => {
    expect(parseDateValue("13/01/2024")).toBeNull();
    expect(parseDateValue("01/32/2024")).toBeNull();
    expect(parseDateValue("2024-00-10")).toBeNull();
  });

  it("rejects non-strings and junk", () => {
    expect(parseDateValue(20240103)).toBeNull();
    expect(parseDateValue(null)).toBeNull();
    expect(parseDateValue("yesterday")).toBeNull();
    expect(parseDateValue("2024/01/03")).toBeNull();
  });
});

describe("toIsoDate", () => {
  it("renders parseable dates as YYYY-MM-DD", () => {
    expect(toIsoDate("12/25/2024")).toBe("2024-12-25");
    expect(toIsoDate("2024-12-25")).toBe("2024-12-25");
  });

  it("passes unparseable values through unchanged", () => {
    expect(toIsoDate("pending")).toBe("pending");
    expect(toIsoDate(null)).toBe("");
  });
});

describe("dateSorter", () => {
  it("sorts chronologically across both formats", () => {
    const values = ["12/25/2024", "2024-01-03", "06/15/2024"];
    expect(values.sort(dateSorter)).toEqual(["2024-01-03", "06/15/2024", "12/25/2024"]);
  });

  it("sorts unparseable values last", () => {
    const values = ["garbage", "2024-01-03", ""];
    expect(values.sort(dateSorter)).toEqual(["2024-01-03", "garbage", ""]);
  });

  it("treats two unparseable values as equal", () => {
    expect(dateSorter("a", "b")).toBe(0);
  });
});
