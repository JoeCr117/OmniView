"use client";

import { useMemo, useState } from "react";

import type { BreakdownRow } from "@/apps/expense-tracker/lib/api";
import {
  CATEGORY_HIERARCHY,
  filterRows,
  pieSlices,
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
  selectedKey = null,
  onSelect,
}: {
  rows: readonly BreakdownRow[];
  selectedKey?: string | null;
  onSelect?: (criterion: { dim: Dimension; key: string } | null) => void;
}) {
  const [drill, setDrill] = useState<DrillState>(INITIAL_DRILL);
  const [drillMode, setDrillMode] = useState(false);

  const dim = currentDimension(drill, CATEGORY_HIERARCHY);

  const slices = useMemo(() => {
    if (dim === undefined) return [];
    return pieSlices(filterRows(rows, drillFilter(drill)), dim);
  }, [rows, drill, dim]);

  const title = drillTitle("Expenses", drill, CATEGORY_HIERARCHY);

  function handleSelect(key: string | null) {
    if (drillMode && key !== null) {
      setDrill(drillInto(drill, CATEGORY_HIERARCHY, key));
      return;
    }
    if (onSelect) onSelect(key === null || dim === undefined ? null : { dim, key });
  }

  return (
    <section aria-label="Expenses by category">
      <h2 className="text-sm font-semibold">{title}</h2>
      <DrillToolbar
        drill={drill}
        hierarchy={CATEGORY_HIERARCHY}
        onDrill={setDrill}
        drillMode={drillMode}
        onDrillModeChange={setDrillMode}
        status={drillMode ? "Click a slice to drill into it." : undefined}
      />
      <LazyCategoryPieChart
        slices={slices}
        ariaLabel={title}
        format={formatUsdWhole}
        emptyMessage="No expenses in this selection."
        selectedKey={selectedKey}
        onSelect={handleSelect}
      />
    </section>
  );
}
