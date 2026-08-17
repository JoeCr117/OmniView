/**
 * Year/month slicer semantics, shared by Check Book and Breakdown.
 *
 * These reproduce Power BI's slicer behaviour, which is not the obvious one:
 * an *empty* selection means "all", not "none", so a fresh page shows
 * everything; a plain click selects exactly one value and clicking the only
 * selected value clears back to "all"; shift/ctrl-click toggles.
 *
 * Dates arrive as `YYYY-MM-DD` strings from the warehouse and are sliced rather
 * than parsed - there is no date library in this frontend, and a Date object
 * would drag a timezone into a question that has none.
 */

export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function yearOf(date: string): string {
  return date.slice(0, 4);
}

export function monthOf(date: string): number {
  return Number(date.slice(5, 7));
}

/** Every year present in the data, ascending. */
export function yearsIn(dates: readonly string[] | null | undefined): string[] {
  return [...new Set((dates ?? []).map(yearOf))].sort();
}

/** Months that have data within the selected years; an empty year selection means all years. */
export function monthsInYears(
  dates: readonly string[] | null | undefined,
  years: ReadonlySet<string>,
): Set<number> {
  const months = new Set<number>();
  for (const date of dates ?? []) {
    if (years.size === 0 || years.has(yearOf(date))) months.add(monthOf(date));
  }
  return months;
}

/** Whether a date survives the current slicer selection. */
export function inSlicerScope(
  date: string,
  years: ReadonlySet<string>,
  months: ReadonlySet<number>,
): boolean {
  return (
    (years.size === 0 || years.has(yearOf(date))) &&
    (months.size === 0 || months.has(monthOf(date)))
  );
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** Plain click selects just that item (or clears, if it was the only one); extend toggles. */
export function slicerPick<T>(set: ReadonlySet<T>, value: T, extend: boolean): Set<T> {
  if (extend) return toggled(set, value);
  if (set.size === 1 && set.has(value)) return new Set<T>();
  return new Set([value]);
}
