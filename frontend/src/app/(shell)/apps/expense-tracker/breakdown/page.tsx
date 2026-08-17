"use client";

import { useMemo, useState } from "react";

import { BREAKDOWN_KEY, getBreakdown } from "@/apps/expense-tracker/lib/api";
import { YearMonthSlicer } from "@/apps/expense-tracker/components/YearMonthSlicer";
import { BreakdownMatrix } from "@/apps/expense-tracker/components/BreakdownMatrix";
import { inSlicerScope, monthsInYears, slicerPick } from "@/apps/expense-tracker/lib/slicer";
import { ErrorState } from "@/components/common/AsyncState";
import { RefreshBar } from "@/components/common/progress";
import { TableSkeleton } from "@/components/common/skeletons";
import { useResource } from "@/lib/useResource";

/**
 * Breakdown: the legacy Power BI report's third page, rebuilt in-app.
 *
 * The whole transaction fact arrives once under BREAKDOWN_KEY and every
 * interaction - slicers now, drill and cross-filter as the other visuals land -
 * recomputes from it client-side. That is what makes a click instant, and it is
 * why the arithmetic lives in `lib/breakdown.ts` as pure functions rather than
 * in an endpoint per visual.
 */
export default function BreakdownPage() {
  const { data, status, error, isValidating, refetch } = useResource(BREAKDOWN_KEY, getBreakdown);

  // Empty selection = no filter = every year/month (Power BI filter context).
  const [selYears, setSelYears] = useState<Set<string>>(new Set());
  const [selMonths, setSelMonths] = useState<Set<number>>(new Set());

  const dates = useMemo(() => (data ?? []).map((row) => row.calendar_date), [data]);

  const scoped = useMemo(
    () => (data ?? []).filter((row) => inSlicerScope(row.calendar_date, selYears, selMonths)),
    [data, selYears, selMonths],
  );

  function pickYear(year: string, extend: boolean) {
    const next = slicerPick(selYears, year, extend);
    setSelYears(next);
    // Drop months that have no data under the new year scope; their buttons
    // disable and would otherwise stay stuck selected.
    const available = monthsInYears(dates, next);
    setSelMonths((prev) => new Set([...prev].filter((month) => available.has(month))));
  }

  if (status === "error") return <ErrorState message={String(error)} onRetry={refetch} />;
  if (status === "loading") {
    return (
      <main className="mx-auto w-full max-w-7xl p-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Breakdown</h1>
        <TableSkeleton rows={12} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl p-6">
      <RefreshBar active={isValidating} />
      <h1 className="text-2xl font-semibold tracking-tight">Breakdown</h1>
      <YearMonthSlicer
        dates={dates}
        selectedYears={selYears}
        selectedMonths={selMonths}
        onYearPick={pickYear}
        onMonthPick={(month, extend) =>
          setSelMonths((prev) => slicerPick(prev, month, extend))
        }
      />
      <BreakdownMatrix rows={scoped} />
    </main>
  );
}
