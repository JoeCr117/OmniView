"use client";

import { ChevronsDown } from "lucide-react";
import { useMemo } from "react";
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
  drillFilter,
  drillInto,
  drillLevel,
  type DrillState,
} from "@/apps/expense-tracker/lib/drill";
import type { MatrixView } from "@/apps/expense-tracker/lib/breakdownView";
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
  view,
  onViewChange,
  selectedAccounts,
  onSelect,
}: {
  rows: readonly BreakdownRow[];
  /** Drill position and toggles, owned by the page so Restart can clear them. */
  view: MatrixView;
  onViewChange: (next: MatrixView) => void;
  /** Account columns the reader has cross-filtered on; their headers are marked. */
  selectedAccounts?: readonly string[];
  /** Ctrl/⌘-clicking an account column header reports it as a cross-filter criterion. */
  onSelect?: (criterion: { dim: Dimension; key: string }, extend: boolean) => void;
}) {
  const { drill, drillMode, expandAll } = view;
  const setDrill = (next: DrillState) => onViewChange({ ...view, drill: next });

  const scoped = useMemo(() => filterRows(rows, drillFilter(drill)), [rows, drill]);
  const dims = useMemo(() => MATRIX_HIERARCHY.slice(drillLevel(drill)), [drill]);
  const accountTypes = useMemo(() => keysPresent(scoped, "accountType"), [scoped]);
  const nodes = useMemo(() => pivot(scoped, dims, "accountType"), [scoped, dims]);
  const columns = useMemo(() => matrixColumns(dims, accountTypes), [dims, accountTypes]);

  const headerClassNames = useMemo(
    () =>
      Object.fromEntries(
        (selectedAccounts ?? []).map((account) => [accountField(account), "matrix-selected"]),
      ),
    [selectedAccounts],
  );

  /**
   * Rows drill, and nothing else. They used to cross-filter too, on a plain
   * click; the account column header carries that now, which is where the
   * source report puts it and which leaves a row click free to mean the one
   * thing a tree row should mean.
   */
  function handleRowClick(rowData: object) {
    const { key } = rowData as { key?: string };
    if (key === undefined || !drillMode) return;
    setDrill(drillInto(drill, MATRIX_HIERARCHY, key));
  }

  /**
   * Ctrl/⌘ (or shift) is required, because a plain header click is already
   * spent: Tabulator sorts on it, and sorting an account column is worth
   * keeping. The modifier is also what the source report used, so a reader
   * coming from it reaches for the right one.
   */
  function handleHeaderClick(field: string, event: UIEvent) {
    const mouse = event as MouseEvent;
    if (!(mouse.ctrlKey || mouse.shiftKey || mouse.metaKey)) return;
    const account = accountOf(field);
    if (account === null) return;
    // Always extending: a modifier click that dropped the other visuals'
    // selections would make the compound filter unbuildable, since this is the
    // only gesture the matrix has.
    onSelect?.({ dim: "accountType", key: account }, true);
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
        onDrillModeChange={(next) => onViewChange({ ...view, drillMode: next })}
        status={drillMode ? "Click a row to drill into it." : `Showing ${nodes.length} rows.`}
      >
        <ToolbarButton
          label="Expand all one level down"
          icon={<ChevronsDown />}
          pressed={expandAll}
          disabled={dims.length < 2}
          onClick={() => onViewChange({ ...view, expandAll: !expandAll })}
        />
      </DrillToolbar>

      <DataTable
        key={`${dims.join("-")}|${accountTypes.join("-")}|${expandAll}`}
        data={nodes}
        columns={columns}
        className="min-h-0 flex-1"
        placeholder="No transactions in this selection."
        onRowClick={handleRowClick}
        onHeaderClick={handleHeaderClick}
        headerClassNames={headerClassNames}
        options={{
          layout: "fitColumns",
          height: "100%",
          // Sorting moves to the sort arrow so the header text is free for the
          // cross-filter gesture. Tabulator binds its sort to the whole header
          // element, and its own source recommends exactly this whenever
          // something else wants the header click - without it, one Ctrl+click
          // both filters AND re-sorts, and the re-sort is what the reader sees.
          headerSortClickElement: "icon",
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

/**
 * The Tabulator field an account column lives at, and its inverse.
 *
 * Written down once, in both directions, because the header click arrives as a
 * field name and has to become an account again. Two independent string
 * templates would drift the moment the column layout changed, and the failure
 * would be a header that silently stops filtering.
 */
const ACCOUNT_FIELD_PREFIX = "values.";

function accountField(account: string): string {
  return `${ACCOUNT_FIELD_PREFIX}${account}`;
}

function accountOf(field: string): string | null {
  return field.startsWith(ACCOUNT_FIELD_PREFIX)
    ? field.slice(ACCOUNT_FIELD_PREFIX.length)
    : null;
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
      field: accountField(account),
      ...currency,
    })),
    { title: "Total", field: "total", ...currency, cssClass: "matrix-total" },
  ];
}
