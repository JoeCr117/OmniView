import { describe, expect, it } from "vitest";

import { quoterFor } from "./dialect";

describe("quoterFor", () => {
  it("quotes with double quotes for postgres", () => {
    expect(quoterFor("postgres")("gold_DimDate")).toBe('"gold_DimDate"');
  });

  it("quotes with backticks for databricks", () => {
    expect(quoterFor("databricks")("gold_DimDate")).toBe("`gold_DimDate`");
  });

  it("falls back to ANSI for a dialect nobody has taught it about", () => {
    // SourceInfo.dialect is a plain string on the wire, so this is reachable
    // without anyone editing this module.
    expect(quoterFor("duckdb")("t")).toBe('"t"');
    expect(quoterFor("")("t")).toBe('"t"');
  });

  it("reads the dialect case- and whitespace-insensitively", () => {
    expect(quoterFor(" Databricks ")("t")).toBe("`t`");
  });

  it("escapes an embedded quote by doubling it, so the identifier survives", () => {
    expect(quoterFor("postgres")('we"ird')).toBe('"we""ird"');
    expect(quoterFor("databricks")("we`ird")).toBe("`we``ird`");
  });

  it("leaves the other engine's quote character alone", () => {
    expect(quoterFor("postgres")("back`tick")).toBe('"back`tick"');
    expect(quoterFor("databricks")('double"quote')).toBe('`double"quote`');
  });
});
