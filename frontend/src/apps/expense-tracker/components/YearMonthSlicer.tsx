"use client";

import { useMemo } from "react";

import { MONTH_LABELS, monthsInYears, yearsIn } from "@/apps/expense-tracker/lib/slicer";

/**
 * The year and month slicer strips, shared by Check Book and Breakdown.
 *
 * Selection lives with the caller, not here: two pages keep it in their own
 * state, and Breakdown's Restart button has to clear it from outside. This
 * renders and reports clicks, nothing more.
 *
 * Months with no data under the selected years are disabled rather than hidden,
 * so the strip stays a stable twelve-button row instead of reflowing as years
 * are picked.
 */
export function YearMonthSlicer({
  dates,
  selectedYears,
  selectedMonths,
  onYearPick,
  onMonthPick,
}: {
  /** Every date in scope, `YYYY-MM-DD`; the available years and months come from these. */
  dates: readonly string[];
  selectedYears: ReadonlySet<string>;
  selectedMonths: ReadonlySet<number>;
  /** `extend` is shift/ctrl-click: toggle within a multi-selection. */
  onYearPick: (year: string, extend: boolean) => void;
  onMonthPick: (month: number, extend: boolean) => void;
}) {
  const years = useMemo(() => yearsIn(dates), [dates]);
  const monthsWithData = useMemo(() => monthsInYears(dates, selectedYears), [dates, selectedYears]);

  return (
    <>
      <div style={{ display: "flex", gap: 4, margin: "16px 0 8px" }}>
        {years.map((y) => (
          <button
            key={y}
            className={`slicer-btn${selectedYears.has(y) ? " active" : ""}`}
            style={{ flex: 1 }}
            aria-pressed={selectedYears.has(y)}
            onClick={(e) => onYearPick(y, e.shiftKey || e.ctrlKey)}
          >
            {y}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {MONTH_LABELS.map((label, i) => {
          const m = i + 1;
          return (
            <button
              key={m}
              className={`slicer-btn${selectedMonths.has(m) ? " active" : ""}`}
              style={{ flex: 1 }}
              aria-pressed={selectedMonths.has(m)}
              disabled={!monthsWithData.has(m)}
              onClick={(e) => onMonthPick(m, e.shiftKey || e.ctrlKey)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}
