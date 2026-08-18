/**
 * The Breakdown page's arithmetic: grouping, pivoting and running totals over
 * the transaction feed.
 *
 * All of it is pure - rows in, values out - because the page recomputes on every
 * slicer click and every cross-filter selection. Doing that here rather than
 * over the network is what makes a click feel instant (the whole fact is ~1.5k
 * rows), and it is what makes this testable without a fixture, a DOM or a
 * server.
 *
 * `amount` is signed as the warehouse stores it: expenses negative, income
 * positive, on every account type. Anything that reports "spend" therefore
 * negates rather than taking an absolute value, so an income row can never be
 * silently counted as spending.
 */

import type { BreakdownRow } from "./api";
import { MONTH_LABELS } from "./slicer";

export type Dimension =
  | "year"
  | "month"
  | "day"
  | "date"
  | "accountType"
  | "category"
  | "subCategory"
  | "label";

/** The waterfall's two drill paths, and the matrix's row hierarchy. */
export const DATE_HIERARCHY: readonly Dimension[] = ["year", "month", "day"];
export const CATEGORY_HIERARCHY: readonly Dimension[] = ["category", "subCategory", "label"];
export const MATRIX_HIERARCHY: readonly Dimension[] = ["date", "label"];

/**
 * Which of its two paths the waterfall is drilling.
 *
 * Here rather than in the chart component because the page owns the axis now -
 * Restart has to be able to put it back, and a component-local type would make
 * the page import from its own child to say so.
 */
export type Axis = "date" | "category";

export const AXIS_HIERARCHIES: Record<Axis, readonly Dimension[]> = {
  date: DATE_HIERARCHY,
  category: CATEGORY_HIERARCHY,
};

export const AXIS_LABELS: Record<Axis, string> = { date: "Date", category: "Category" };

/** How a dimension is named in a column header or a chart title. */
export const DIMENSION_TITLES: Record<Dimension, string> = {
  year: "Year",
  month: "Month",
  day: "Day",
  date: "CalendarDate",
  accountType: "AccountType",
  category: "Category",
  subCategory: "SubCategory",
  label: "Label",
};

/** The synthetic bar closing a waterfall; never a real group key. */
export const WATERFALL_TOTAL_KEY = "__total__";

/**
 * The group a row falls in. Keys are chosen to sort correctly as plain strings
 * ("01".."12" for months), so ordering never needs a parallel numeric field.
 */
export function dimensionKey(row: BreakdownRow, dim: Dimension): string {
  switch (dim) {
    case "year":
      return row.calendar_date.slice(0, 4);
    case "month":
      return row.calendar_date.slice(5, 7);
    case "day":
      return row.calendar_date.slice(8, 10);
    case "date":
      return row.calendar_date;
    case "accountType":
      return row.account_type;
    case "category":
      return row.category;
    case "subCategory":
      return row.sub_category;
    case "label":
      return row.label;
  }
}

/** How a group key is shown: "02" reads as "February" on an axis, not as a number. */
export function dimensionLabel(dim: Dimension, key: string): string {
  if (dim === "month") return MONTH_LABELS[Number(key) - 1] ?? key;
  if (dim === "day") return String(Number(key));
  return key;
}

/** One step of a drill path or a cross-filter selection. */
export interface Criterion {
  dim: Dimension;
  key: string;
}

export function matches(row: BreakdownRow, path: readonly Criterion[]): boolean {
  return path.every((criterion) => dimensionKey(row, criterion.dim) === criterion.key);
}

export function filterRows(
  rows: readonly BreakdownRow[],
  path: readonly Criterion[],
): readonly BreakdownRow[] {
  return path.length === 0 ? rows : rows.filter((row) => matches(row, path));
}

/**
 * Money, to the cent. Summing floats leaves -1069.9600000000003 behind, which
 * survives into a label and into a test's expected value; rounding at each
 * aggregate boundary keeps both honest.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function netOf(rows: readonly BreakdownRow[]): number {
  return round2(rows.reduce((sum, row) => sum + row.amount, 0));
}

function groupBy(
  rows: readonly BreakdownRow[],
  dim: Dimension,
): Map<string, readonly BreakdownRow[]> {
  const groups = new Map<string, BreakdownRow[]>();
  for (const row of rows) {
    const key = dimensionKey(row, dim);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/** Every key present for a dimension, ascending - the matrix's live columns. */
export function keysPresent(rows: readonly BreakdownRow[], dim: Dimension): string[] {
  return [...new Set(rows.map((row) => dimensionKey(row, dim)))].sort();
}

/** A matrix row: one group, its per-column nets, and its children if it drills further. */
export interface MatrixNode {
  /** Unique across the whole tree - the "/"-joined path. Tabulator indexes rows by it. */
  id: string;
  /** This level's group key, for cross-filtering. */
  key: string;
  dim: Dimension;
  label: string;
  /** Column key -> net. Absent columns render blank, as in the source report. */
  values: Record<string, number>;
  total: number;
  _children?: MatrixNode[];
}

function columnTotals(rows: readonly BreakdownRow[], colDim: Dimension): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [key, group] of groupBy(rows, colDim)) totals[key] = netOf(group);
  return totals;
}

/** Dates read newest-first like a statement; text reads A-Z. */
function matrixOrder(dim: Dimension): (a: MatrixNode, b: MatrixNode) => number {
  const newestFirst = dim === "date" || dim === "year" || dim === "month" || dim === "day";
  return (a, b) => (newestFirst ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key));
}

function pivotWithin(
  rows: readonly BreakdownRow[],
  rowDims: readonly Dimension[],
  colDim: Dimension,
  prefix: string,
): MatrixNode[] {
  const [dim, ...rest] = rowDims;
  if (dim === undefined) return [];

  const nodes: MatrixNode[] = [];
  for (const [key, group] of groupBy(rows, dim)) {
    const id = prefix ? `${prefix}/${key}` : key;
    const node: MatrixNode = {
      id,
      key,
      dim,
      label: dimensionLabel(dim, key),
      values: columnTotals(group, colDim),
      total: netOf(group),
    };
    if (rest.length > 0) node._children = pivotWithin(group, rest, colDim, id);
    nodes.push(node);
  }
  return nodes.sort(matrixOrder(dim));
}

/** The matrix: `rowDims` deep, one column per key of `colDim`. */
export function pivot(
  rows: readonly BreakdownRow[],
  rowDims: readonly Dimension[],
  colDim: Dimension,
): MatrixNode[] {
  return pivotWithin(rows, rowDims, colDim, "");
}

export interface WaterfallBar {
  key: string;
  dim: Dimension;
  label: string;
  /** The group's net: this bar's height and sign. */
  delta: number;
  /** Running total before and after the bar - the bar floats between them. */
  start: number;
  end: number;
  kind: "increase" | "decrease" | "total";
}

/**
 * A waterfall over `dim`, ascending, closed by a Total bar.
 *
 * Ascending always: these axes are years, months and days, where time runs left
 * to right, and the categorical axis reads alphabetically like the source
 * report. A zero-delta group counts as an increase - it is not a loss.
 */
export function waterfall(rows: readonly BreakdownRow[], dim: Dimension): WaterfallBar[] {
  const groups = [...groupBy(rows, dim)].sort(([a], [b]) => a.localeCompare(b));
  if (groups.length === 0) return [];

  const bars: WaterfallBar[] = [];
  let running = 0;
  for (const [key, group] of groups) {
    const delta = netOf(group);
    const start = running;
    running = round2(running + delta);
    bars.push({
      key,
      dim,
      label: dimensionLabel(dim, key),
      delta,
      start,
      end: running,
      kind: delta < 0 ? "decrease" : "increase",
    });
  }

  bars.push({
    key: WATERFALL_TOTAL_KEY,
    dim,
    label: "Total",
    delta: running,
    start: 0,
    end: running,
    kind: "total",
  });
  return bars;
}

export interface PieSlice {
  key: string;
  dim: Dimension;
  label: string;
  /** Spend as a positive magnitude. */
  value: number;
  /** Share of the spend shown, 0-100. */
  pct: number;
}

/**
 * Spend by `dim`, largest first.
 *
 * Only groups with a negative net appear: this is an expenses chart, so Income
 * is excluded by arithmetic rather than by naming a category, and a category
 * that nets positive over the window (refunds beating purchases) drops out for
 * the same reason. Percentages are shares of what is shown, so they total 100.
 */
export function pieSlices(rows: readonly BreakdownRow[], dim: Dimension): PieSlice[] {
  const spend: { key: string; value: number }[] = [];
  for (const [key, group] of groupBy(rows, dim)) {
    const net = netOf(group);
    if (net < 0) spend.push({ key, value: -net });
  }

  const total = spend.reduce((sum, slice) => sum + slice.value, 0);
  return spend
    .map((slice) => ({
      key: slice.key,
      dim,
      label: dimensionLabel(dim, slice.key),
      value: slice.value,
      pct: total === 0 ? 0 : round2((slice.value / total) * 100),
    }))
    .sort((a, b) => b.value - a.value);
}
