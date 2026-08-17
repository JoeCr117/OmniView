"use client";

import { useMemo, useState } from "react";

import type { BreakdownRow } from "@/apps/expense-tracker/lib/api";
import {
  CATEGORY_HIERARCHY,
  DATE_HIERARCHY,
  DIMENSION_TITLES,
  WATERFALL_TOTAL_KEY,
  filterRows,
  waterfall,
  type Dimension,
} from "@/apps/expense-tracker/lib/breakdown";
import {
  INITIAL_DRILL,
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

type Axis = "date" | "category";

const HIERARCHIES: Record<Axis, readonly Dimension[]> = {
  date: DATE_HIERARCHY,
  category: CATEGORY_HIERARCHY,
};

const AXIS_LABELS: Record<Axis, string> = { date: "Date", category: "Category" };

export function BreakdownWaterfall({
  rows,
  selectedKey = null,
  onSelect,
}: {
  rows: readonly BreakdownRow[];
  selectedKey?: string | null;
  onSelect?: (criterion: { dim: Dimension; key: string } | null) => void;
}) {
  const [axis, setAxis] = useState<Axis>("date");
  const [drills, setDrills] = useState<Record<Axis, DrillState>>({
    date: INITIAL_DRILL,
    category: INITIAL_DRILL,
  });
  const [drillMode, setDrillMode] = useState(false);

  const hierarchy = HIERARCHIES[axis];
  const drill = drills[axis];
  const dim = currentDimension(drill, hierarchy);

  const bars = useMemo(() => {
    if (dim === undefined) return [];
    return waterfall(filterRows(rows, drillFilter(drill)), dim);
  }, [rows, drill, dim]);

  function setDrill(next: DrillState) {
    setDrills((current) => ({ ...current, [axis]: next }));
  }

  function handleSelect(key: string | null) {
    // The closing Total bar restates the whole chart; it is not a filterable mark.
    if (key === WATERFALL_TOTAL_KEY) return;
    if (drillMode && key !== null) {
      setDrill(drillInto(drill, hierarchy, key));
      return;
    }
    if (onSelect) onSelect(key === null || dim === undefined ? null : { dim, key });
  }

  return (
    <section aria-label="Transactions waterfall">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{drillTitle("Transactions", drill, hierarchy)}</h2>
        <div className="flex gap-1">
          {(Object.keys(HIERARCHIES) as Axis[]).map((option) => (
            <Button
              key={option}
              size="xs"
              variant={axis === option ? "secondary" : "ghost"}
              aria-pressed={axis === option}
              onClick={() => setAxis(option)}
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
        onDrillModeChange={setDrillMode}
        status={drillMode ? "Click a bar to drill into it." : undefined}
      />

      <LazyWaterfallChart
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
        selectedKey={selectedKey}
        onSelect={handleSelect}
      />
    </section>
  );
}
