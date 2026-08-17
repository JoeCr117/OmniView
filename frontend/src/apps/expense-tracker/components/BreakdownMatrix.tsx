"use client";

import { ChevronsDown } from "lucide-react";
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
import { INITIAL_DRILL, drillFilter, drillInto, drillLevel } from "@/apps/expense-tracker/lib/drill";
import { txn } from "@/apps/expense-tracker/lib/money";
import { DrillToolbar, ToolbarButton } from "@/apps/expense-tracker/components/DrillToolbar";
import { DataTable } from "@/components/common/DataTable";

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
export function BreakdownMatrix({
  rows,
  onSelect,
}: {
  rows: readonly BreakdownRow[];
  /** A row click that is not a drill reports the row as a cross-filter criterion. */
  onSelect?: (criterion: { dim: Dimension; key: string }, extend: boolean) => void;
}) {
  const [drill, setDrill] = useState(INITIAL_DRILL);
  const [drillMode, setDrillMode] = useState(false);
  const [expandAll, setExpandAll] = useState(false);

  const scoped = useMemo(() => filterRows(rows, drillFilter(drill)), [rows, drill]);
  const dims = useMemo(() => MATRIX_HIERARCHY.slice(drillLevel(drill)), [drill]);
  const accountTypes = useMemo(() => keysPresent(scoped, "accountType"), [scoped]);
  const nodes = useMemo(() => pivot(scoped, dims, "accountType"), [scoped, dims]);
  const columns = useMemo(() => matrixColumns(dims, accountTypes), [dims, accountTypes]);

  function handleRowClick(rowData: object, event: UIEvent) {
    const { key, dim } = rowData as { key?: string; dim?: Dimension };
    if (key === undefined || dim === undefined) return;
    if (drillMode) {
      setDrill((current) => drillInto(current, MATRIX_HIERARCHY, key));
      return;
    }
    const mouse = event as MouseEvent;
    onSelect?.({ dim, key }, mouse.ctrlKey || mouse.shiftKey || mouse.metaKey);
  }

  return (
    // Fixed height when stacked, stretched to the grid row at xl: either way the
    // height is definite, which is what lets Tabulator resolve `height: "100%"`.
    <section aria-label="Transactions matrix" className="flex h-[70vh] min-h-0 flex-col xl:h-auto">
      <DrillToolbar
        drill={drill}
        hierarchy={MATRIX_HIERARCHY}
        onDrill={setDrill}
        drillMode={drillMode}
        onDrillModeChange={setDrillMode}
        status={drillMode ? "Click a row to drill into it." : `Showing ${nodes.length} rows.`}
      >
        <ToolbarButton
          label="Expand all one level down"
          icon={<ChevronsDown />}
          pressed={expandAll}
          disabled={dims.length < 2}
          onClick={() => setExpandAll(!expandAll)}
        />
      </DrillToolbar>

      <DataTable
        key={`${dims.join("-")}|${accountTypes.join("-")}|${expandAll}`}
        data={nodes}
        columns={columns}
        className="min-h-0 flex-1"
        placeholder="No transactions in this selection."
        onRowClick={handleRowClick}
        options={{
          layout: "fitColumns",
          height: "100%",
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

function matrixColumns(
  dims: readonly Dimension[],
  accountTypes: readonly string[],
): ColumnDefinition[] {
  const [rowDim] = dims;
  // Narrower than Check Book's columns: this grid shares the page with the
  // charts, and six currency columns at the default width overflow it.
  const currency = { ...txn, minWidth: 100 };
  return [
    {
      title: rowDim ? DIMENSION_TITLES[rowDim] : "",
      field: "label",
      frozen: true,
      width: 150,
      bottomCalc: () => "Total",
    },
    ...accountTypes.map((account) => ({
      title: account,
      field: `values.${account}`,
      ...currency,
    })),
    { title: "Total", field: "total", ...currency, cssClass: "matrix-total" },
  ];
}
