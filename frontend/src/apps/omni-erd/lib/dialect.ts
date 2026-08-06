/**
 * The only place on the frontend that knows one engine from another.
 *
 * `ir.py` is dialect-agnostic on purpose - the renderer must not learn two ways
 * to draw a table - so the moment a generated statement has to be spelled for a
 * real engine, that decision is made here, once, and nowhere else.
 *
 * Total by construction: `SourceInfo.dialect` is a plain string on the wire, so
 * an engine nobody has taught this module about falls back to ANSI quoting
 * rather than failing. ANSI is what Postgres (and Lakebase) want anyway.
 */

export type Quoter = (identifier: string) => string;

const ansi: Quoter = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const backtick: Quoter = (identifier) => `\`${identifier.replaceAll("`", "``")}\``;

export function quoterFor(dialect: string): Quoter {
  return dialect.trim().toLowerCase() === "databricks" ? backtick : ansi;
}
