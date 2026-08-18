"use client";

import { useMemo } from "react";

import type { BreakdownRow } from "@/apps/expense-tracker/lib/api";
import {
  CATEGORY_HIERARCHY,
  filterRows,
  pieSlices,
  type Dimension,
} from "@/apps/expense-tracker/lib/breakdown";
import {
  currentDimension,
  drillFilter,
  drillInto,
  drillTitle,
  type DrillState,
} from "@/apps/expense-tracker/lib/drill";
import type { PieView } from "@/apps/expense-tracker/lib/breakdownView";
import { formatUsdWhole } from "@/apps/expense-tracker/lib/money";
import { DrillToolbar } from "@/apps/expense-tracker/components/DrillToolbar";
import { LazyCategoryPieChart } from "@/components/charts/LazyCategoryPieChart";

/**
 * Expenses by category, drilling Category → SubCategory → Label.
 *
 * This is the one visual on the page that is *not* about net position: income is
 * excluded, by arithmetic rather than by naming a category (see `pieSlices`), so
 * the slices are spend and the percentages are shares of spend.
 */
export function BreakdownPie({
  rows,
  view,
  onViewChange,
  highlightKeys,
  onSelect,
}: {
  rows: readonly BreakdownRow[];
  /** Drill position and drill mode, owned by the page so Restart can clear them. */
  view: PieView;
  onViewChange: (next: PieView) => void;
  highlightKeys?: readonly string[];
  onSelect?: (criterion: { dim: Dimension; key: string }, extend: boolean) => void;
}) {
  const { drill, drillMode } = view;
  const setDrill = (next: DrillState) => onViewChange({ ...view, drill: next });

  const dim = currentDimension(drill, CATEGORY_HIERARCHY);

  const slices = useMemo(() => {
    if (dim === undefined) return [];
    return pieSlices(filterRows(rows, drillFilter(drill)), dim);
  }, [rows, drill, dim]);

  const title = drillTitle("Expenses", drill, CATEGORY_HIERARCHY);

  function handleSelect(key: string, extend: boolean) {
    if (drillMode) {
      setDrill(drillInto(drill, CATEGORY_HIERARCHY, key));
      return;
    }
    if (onSelect && dim !== undefined) onSelect({ dim, key }, extend);
  }

  return (
    <section
      aria-label="Expenses by category"
      className="flex h-[320px] min-h-0 flex-col xl:h-auto xl:flex-1"
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      <DrillToolbar
        drill={drill}
        hierarchy={CATEGORY_HIERARCHY}
        onDrill={setDrill}
        drillMode={drillMode}
        onDrillModeChange={(next) => onViewChange({ ...view, drillMode: next })}
        status={drillMode ? "Click a slice to drill into it." : undefined}
      />
      <div className="min-h-0 flex-1">
        <LazyCategoryPieChart
          height="100%"
          slices={slices}
          ariaLabel={title}
          format={formatUsdWhole}
          emptyMessage="No expenses in this selection."
          highlightKeys={highlightKeys}
          onSelect={handleSelect}
        />
      </div>
    </section>
  );
}
