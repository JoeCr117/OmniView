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
  isFiltered,
  rowsFor,
  type VisualId,
} from "@/apps/expense-tracker/lib/crossFilter";
import {
  INITIAL_VIEW,
  isDefaultView,
  type BreakdownView,
} from "@/apps/expense-tracker/lib/breakdownView";
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
 * (Power BI's page filter), then cross-filter selections narrow the visuals that
 * did not make them.
 *
 * **All view state lives here, including each visual's drill position.** The
 * visuals are controlled. That is not tidiness - it is what makes Restart
 * possible: the button has to be able to see a drill to enable itself, and to
 * clear one when pressed, and it could do neither while three components kept
 * their own `useState`. See `lib/breakdownView.ts`.
 */
export default function BreakdownPage() {
  const { data, status, error, isValidating, refetch } = useResource(BREAKDOWN_KEY, getBreakdown);

  const [view, setView] = useState<BreakdownView>(INITIAL_VIEW);
  const { years, months, filter } = view;

  const dates = useMemo(() => (data ?? []).map((row) => row.calendar_date), [data]);

  const scoped = useMemo(
    () => (data ?? []).filter((row) => inSlicerScope(row.calendar_date, years, months)),
    [data, years, months],
  );

  function pickYear(year: string, extend: boolean) {
    const nextYears = slicerPick(years, year, extend);
    // Drop months that have no data under the new year scope; their buttons
    // disable and would otherwise stay stuck selected.
    const available = monthsInYears(dates, nextYears);
    setView({
      ...view,
      years: nextYears,
      months: new Set([...months].filter((month) => available.has(month))),
    });
  }

  function select(source: VisualId, criterion: Criterion, extend: boolean) {
    setView((current) => ({
      ...current,
      filter: applyClick(current.filter, source, criterion, extend),
    }));
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
    // Full width and, from xl, exactly the height of the shell's scroll area:
    // three linked visuals are read together, so the page should not make the
    // reader scroll between them, and a centred column would waste the width
    // the matrix's six currency columns want. Other pages cap at max-w-6xl
    // because prose and a single table read better narrow; this one does not.
    <main className="flex w-full flex-col p-6 xl:min-h-0 xl:flex-1">
      <RefreshBar active={isValidating} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Breakdown</h1>
        <div className="flex items-center gap-2">
          {isFiltered(filter) ? (
            <span className="text-xs text-muted-foreground">
              Filtered by <span className="font-medium">{describeSelection(filter)}</span>
            </span>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setView(INITIAL_VIEW)}
            disabled={isDefaultView(view)}
          >
            <RotateCcw />
            Restart
          </Button>
        </div>
      </div>
      <YearMonthSlicer
        dates={dates}
        selectedYears={years}
        selectedMonths={months}
        onYearPick={pickYear}
        onMonthPick={(month, extend) =>
          setView((current) => ({ ...current, months: slicerPick(current.months, month, extend) }))
        }
      />
      {/* The matrix carries six columns of currency, so it takes the wider
          share; below xl there is not room for both, and they stack. */}
      <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <BreakdownMatrix
          rows={rowsFor(scoped, filter, "matrix")}
          view={view.matrix}
          onViewChange={(matrix) => setView((current) => ({ ...current, matrix }))}
          selectedAccounts={highlightedKeys(filter, "matrix")}
          onSelect={(criterion, extend) => select("matrix", criterion, extend)}
        />
        <div className="flex min-h-0 flex-col gap-6">
          <BreakdownWaterfall
            rows={rowsFor(scoped, filter, "waterfall")}
            view={view.waterfall}
            onViewChange={(waterfall) => setView((current) => ({ ...current, waterfall }))}
            highlightKeys={highlightedKeys(filter, "waterfall")}
            onSelect={(criterion, extend) => select("waterfall", criterion, extend)}
          />
          <BreakdownPie
            rows={rowsFor(scoped, filter, "pie")}
            view={view.pie}
            onViewChange={(pie) => setView((current) => ({ ...current, pie }))}
            highlightKeys={highlightedKeys(filter, "pie")}
            onSelect={(criterion, extend) => select("pie", criterion, extend)}
          />
        </div>
      </div>
    </main>
  );
}
