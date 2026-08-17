"use client";

import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { BREAKDOWN_KEY, getBreakdown } from "@/apps/expense-tracker/lib/api";
import { BreakdownMatrix } from "@/apps/expense-tracker/components/BreakdownMatrix";
import { BreakdownPie } from "@/apps/expense-tracker/components/BreakdownPie";
import { BreakdownWaterfall } from "@/apps/expense-tracker/components/BreakdownWaterfall";
import { YearMonthSlicer } from "@/apps/expense-tracker/components/YearMonthSlicer";
import type { Criterion } from "@/apps/expense-tracker/lib/breakdown";
import {
  applyClick,
  describeSelection,
  highlightedKeys,
  rowsFor,
  type Selection,
  type VisualId,
} from "@/apps/expense-tracker/lib/crossFilter";
import { inSlicerScope, monthsInYears, slicerPick } from "@/apps/expense-tracker/lib/slicer";
import { ErrorState } from "@/components/common/AsyncState";
import { RefreshBar } from "@/components/common/progress";
import { TableSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { useResource } from "@/lib/useResource";

/**
 * Breakdown: the legacy Power BI report's third page, rebuilt in-app.
 *
 * The whole transaction fact arrives once under BREAKDOWN_KEY and every
 * interaction - slicers, drills, cross-filter selections - recomputes from it
 * client-side. That is what makes a click instant, and it is why the arithmetic
 * lives in `lib/` as pure functions rather than in an endpoint per visual.
 *
 * Two kinds of filter compose here, in this order: the slicers scope the page
 * (Power BI's page filter), then a cross-filter selection narrows the visuals
 * that did not make it. Drill state belongs to each visual and survives both.
 */
export default function BreakdownPage() {
  const { data, status, error, isValidating, refetch } = useResource(BREAKDOWN_KEY, getBreakdown);

  // Empty selection = no filter = every year/month (Power BI filter context).
  const [selYears, setSelYears] = useState<Set<string>>(new Set());
  const [selMonths, setSelMonths] = useState<Set<number>>(new Set());
  const [selection, setSelection] = useState<Selection | null>(null);

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

  function select(source: VisualId, criterion: Criterion, extend: boolean) {
    setSelection((current) => applyClick(current, source, criterion, extend));
  }

  function restart() {
    setSelection(null);
    setSelYears(new Set());
    setSelMonths(new Set());
  }

  const isRestartable = selection !== null || selYears.size > 0 || selMonths.size > 0;

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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Breakdown</h1>
        <div className="flex items-center gap-2">
          {selection ? (
            <span className="text-xs text-muted-foreground">
              Filtered by <span className="font-medium">{describeSelection(selection)}</span>
            </span>
          ) : null}
          <Button size="sm" variant="ghost" onClick={restart} disabled={!isRestartable}>
            <RotateCcw />
            Restart
          </Button>
        </div>
      </div>
      <YearMonthSlicer
        dates={dates}
        selectedYears={selYears}
        selectedMonths={selMonths}
        onYearPick={pickYear}
        onMonthPick={(month, extend) => setSelMonths((prev) => slicerPick(prev, month, extend))}
      />
      {/* The matrix carries six columns of currency, so it takes the wider
          share; below xl there is not room for both, and they stack. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <BreakdownMatrix
          rows={rowsFor(scoped, selection, "matrix")}
          onSelect={(criterion, extend) => select("matrix", criterion, extend)}
        />
        <div className="flex flex-col gap-6">
          <BreakdownWaterfall
            rows={rowsFor(scoped, selection, "waterfall")}
            highlightKeys={highlightedKeys(selection, "waterfall")}
            onSelect={(criterion, extend) => select("waterfall", criterion, extend)}
          />
          <BreakdownPie
            rows={rowsFor(scoped, selection, "pie")}
            highlightKeys={highlightedKeys(selection, "pie")}
            onSelect={(criterion, extend) => select("pie", criterion, extend)}
          />
        </div>
      </div>
    </main>
  );
}
