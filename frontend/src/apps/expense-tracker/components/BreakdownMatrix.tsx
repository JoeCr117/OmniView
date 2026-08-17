"use client";

import { ChevronDown, ChevronUp, ChevronsDown, ListTree } from "lucide-react";
import { useMemo, useState } from "react";
import type { ColumnDefinition } from "tabulator-tables";

import type { BreakdownRow } from "@/apps/expense-tracker/lib/api";
import {
  DIMENSION_TITLES,
  MATRIX_HIERARCHY,
  filterRows,
  keysPresent,
  pivot,
  type Dimension,
} from "@/apps/expense-tracker/lib/breakdown";
import {
  INITIAL_DRILL,
  canDrillDown,
  canDrillUp,
  drillFilter,
  drillInto,
  drillLevel,
  drillUp,
  skipToNextLevel,
} from "@/apps/expense-tracker/lib/drill";
import { txn } from "@/apps/expense-tracker/lib/money";
import { DataTable } from "@/components/common/DataTable";
import { Button } from "@/components/ui/button";

/**
 * The Breakdown matrix: dates down the side, accounts across the top, nets in
 * the cells - and the Power BI drill controls that go with it.
 *
 * Columns are the account types **present in the current rows**, so filtering to
 * a category drops the accounts it never touched, as the source report does.
 * That is also why the grid is keyed on its column signature: `DataTable` builds
 * Tabulator once and only streams `data` into it (rebuilding on every prop
 * change would throw away sort and scroll state), so a genuine change of shape
 * has to remount it. The key deliberately excludes the rows themselves - a
 * slicer click must not cost the reader their scroll position.
 */
export function BreakdownMatrix({ rows }: { rows: readonly BreakdownRow[] }) {
  const [drill, setDrill] = useState(INITIAL_DRILL);
  const [drillMode, setDrillMode] = useState(false);
  const [expandAll, setExpandAll] = useState(false);

  const scoped = useMemo(() => filterRows(rows, drillFilter(drill)), [rows, drill]);
  const dims = useMemo(() => MATRIX_HIERARCHY.slice(drillLevel(drill)), [drill]);
  const accountTypes = useMemo(() => keysPresent(scoped, "accountType"), [scoped]);
  const nodes = useMemo(() => pivot(scoped, dims, "accountType"), [scoped, dims]);
  const columns = useMemo(() => matrixColumns(dims, accountTypes), [dims, accountTypes]);

  const canDown = canDrillDown(drill, MATRIX_HIERARCHY);

  function handleRowClick(rowData: object) {
    if (!drillMode) return;
    const { key } = rowData as { key?: string };
    if (key !== undefined) setDrill((current) => drillInto(current, MATRIX_HIERARCHY, key));
  }

  return (
    <section aria-label="Transactions matrix">
      <div className="mb-2 flex items-center gap-1">
        <ToolbarButton
          label="Drill up"
          icon={<ChevronUp />}
          disabled={!canDrillUp(drill)}
          onClick={() => setDrill(drillUp)}
        />
        <ToolbarButton
          label="Drill down: click a row to descend into it"
          icon={<ChevronDown />}
          pressed={drillMode}
          disabled={!canDown}
          onClick={() => setDrillMode((on) => !on)}
        />
        <ToolbarButton
          label="Expand all one level down"
          icon={<ChevronsDown />}
          pressed={expandAll}
          disabled={dims.length < 2}
          onClick={() => setExpandAll((on) => !on)}
        />
        <ToolbarButton
          label="Go to the next level in the hierarchy"
          icon={<ListTree />}
          disabled={!canDown}
          onClick={() => setDrill((current) => skipToNextLevel(current, MATRIX_HIERARCHY))}
        />
        <span className="ml-2 text-xs text-muted-foreground">
          {drillMode ? "Click a row to drill into it." : `Showing ${nodes.length} rows.`}
        </span>
      </div>

      <DataTable
        key={`${dims.join("-")}|${accountTypes.join("-")}|${expandAll}`}
        data={nodes}
        columns={columns}
        placeholder="No transactions in this selection."
        onRowClick={handleRowClick}
        options={{
          layout: "fitColumns",
          height: "70vh",
          dataTree: true,
          dataTreeChildField: "_children",
          dataTreeStartExpanded: expandAll,
          // Children are already counted in their parent's total; letting them
          // into the footer calculation would bill every transaction twice.
          dataTreeChildColumnCalcs: false,
          index: "id",
        }}
      />
    </section>
  );
}

function ToolbarButton({
  label,
  icon,
  onClick,
  disabled,
  pressed,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <Button
      variant={pressed ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}

function matrixColumns(
  dims: readonly Dimension[],
  accountTypes: readonly string[],
): ColumnDefinition[] {
  const [rowDim] = dims;
  return [
    {
      title: rowDim ? DIMENSION_TITLES[rowDim] : "",
      field: "label",
      frozen: true,
      width: 190,
      bottomCalc: () => "Total",
    },
    ...accountTypes.map((account) => ({
      title: account,
      field: `values.${account}`,
      ...txn,
    })),
    { title: "Total", field: "total", ...txn, cssClass: "matrix-total" },
  ];
}
