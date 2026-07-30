/**
 * Frontend-only date handling for Tabulator "Date" columns: bank CSV exports
 * use MM/DD/YYYY while the dbt gold tables carry YYYY-MM-DD strings. Sorting
 * either as plain strings mis-orders the US-style values, so Date columns get
 * a real date sorter and a YYYY-MM-DD display formatter. The underlying data
 * (CSV files, API responses) is never modified.
 */

import type { CellComponent, ColumnDefinition } from "tabulator-tables";

/** Parses "YYYY-MM-DD" or "MM/DD/YYYY" to a sortable timestamp; null if unparseable. */
export function parseDateValue(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();

  let year: number, month: number, day: number;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (m) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (!m) return null;
    [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
}

/** Renders a parseable date as YYYY-MM-DD; anything else passes through untouched. */
export function toIsoDate(value: unknown): string {
  const ts = parseDateValue(value);
  if (ts === null) return String(value ?? "");
  return new Date(ts).toISOString().slice(0, 10);
}

/** Tabulator custom sorter: chronological, with unparseable values sorted last. */
export function dateSorter(a: unknown, b: unknown): number {
  const ta = parseDateValue(a);
  const tb = parseDateValue(b);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return ta - tb;
}

/** Column-definition fragment to spread into any Date column. */
export const dateColumnProps: Partial<ColumnDefinition> = {
  sorter: dateSorter,
  formatter: (cell: CellComponent) => toIsoDate(cell.getValue()),
};
