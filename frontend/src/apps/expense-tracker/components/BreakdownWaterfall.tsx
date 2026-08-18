"use client";

import { useMemo } from "react";

import type { BreakdownRow } from "@/apps/expense-tracker/lib/api";
import {
  AXIS_HIERARCHIES,
  AXIS_LABELS,
  DIMENSION_TITLES,
  WATERFALL_TOTAL_KEY,
  filterRows,
  waterfall,
  type Axis,
  type Dimension,
} from "@/apps/expense-tracker/lib/breakdown";
import type { WaterfallView } from "@/apps/expense-tracker/lib/breakdownView";
import {
  currentDimension,
  drillFilter,
  drillInto,
  drillTitle,
  type DrillState,
} from "@/apps/expense-tracker/lib/drill";
import { formatUsd, formatUsdCompact } from "@/apps/expense-tracker/lib/money";
import { DrillToolbar } from "@/apps/expense-tracker/components/DrillToolbar";
import { LazyWaterfallChart } from "@/components/charts/LazyWaterfallChart";
import { Button } from "@/components/ui/button";

/**
 * Net transactions as a waterfall, over either hierarchy the source report used:
 * Year → Month → Day, or Category → SubCategory → Label.
 *
 * Drill state is kept **per axis**, so switching to Category and back does not
 * dump the reader out of the year they were reading. The title follows Power
 * BI's convention and says which way they got here - "by Year and Month" means a
 * year was drilled into and filtered; "by Month" means the level was skipped.
 */

export function BreakdownWaterfall({
  rows,
  view,
  onViewChange,
  highlightKeys,
  onSelect,
}: {
  rows: readonly BreakdownRow[];
  /** Axis, per-axis drill position and drill mode, all owned by the page. */
  view: WaterfallView;
  onViewChange: (next: WaterfallView) => void;
  highlightKeys?: readonly string[];
  onSelect?: (criterion: { dim: Dimension; key: string }, extend: boolean) => void;
}) {
  const { axis, drills, drillMode } = view;

  const hierarchy = AXIS_HIERARCHIES[axis];
  const drill = drills[axis];
  const dim = currentDimension(drill, hierarchy);

  const bars = useMemo(() => {
    if (dim === undefined) return [];
    return waterfall(filterRows(rows, drillFilter(drill)), dim);
  }, [rows, drill, dim]);

  function setDrill(next: DrillState) {
    onViewChange({ ...view, drills: { ...drills, [axis]: next } });
  }

  function handleSelect(key: string, extend: boolean) {
    // The closing Total bar restates the whole chart; it is not a filterable mark.
    if (key === WATERFALL_TOTAL_KEY) return;
    if (drillMode) {
      setDrill(drillInto(drill, hierarchy, key));
      return;
    }
    if (onSelect && dim !== undefined) onSelect({ dim, key }, extend);
  }

  return (
    <section
      aria-label="Transactions waterfall"
      className="flex h-[320px] min-h-0 flex-col xl:h-auto xl:flex-1"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{drillTitle("Transactions", drill, hierarchy)}</h2>
        <div className="flex gap-1">
          {(Object.keys(AXIS_HIERARCHIES) as Axis[]).map((option) => (
            <Button
              key={option}
              size="xs"
              variant={axis === option ? "secondary" : "ghost"}
              aria-pressed={axis === option}
              onClick={() => onViewChange({ ...view, axis: option })}
            >
              {AXIS_LABELS[option]}
            </Button>
          ))}
        </div>
      </div>

      <DrillToolbar
        drill={drill}
        hierarchy={hierarchy}
        onDrill={setDrill}
        drillMode={drillMode}
        onDrillModeChange={(next) => onViewChange({ ...view, drillMode: next })}
        status={drillMode ? "Click a bar to drill into it." : undefined}
      />

      <div className="min-h-0 flex-1">
        <LazyWaterfallChart
          height="100%"
          bars={bars}
          x={{ label: dim ? DIMENSION_TITLES[dim] : "" }}
          y={{
            label: "Transactions",
            unit: "USD",
            format: formatUsd,
            tickFormat: formatUsdCompact,
          }}
          ariaLabel={drillTitle("Transactions", drill, hierarchy)}
          emptyMessage="No transactions in this selection."
          highlightKeys={highlightKeys}
          onSelect={handleSelect}
        />
      </div>
    </section>
  );
}
