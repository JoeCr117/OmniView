"use client";

import { useMemo, useState } from "react";
import {
  DAILY_METRICS_KEY,
  getAllDailyMetrics,
  type DailyMetric,
} from "@/apps/expense-tracker/lib/api";
import { ErrorState } from "@/components/common/AsyncState";
import { DataTable } from "@/components/common/DataTable";
import { RefreshBar } from "@/components/common/progress";
import { TableSkeleton } from "@/components/common/skeletons";
import { dateColumnProps } from "@/apps/expense-tracker/lib/dates";
import { useResource } from "@/lib/useResource";
import type { CellComponent, ColumnDefinition } from "tabulator-tables";

// The year/month slicers filter client-side so clicks are instant (one row per
// day keeps even a decade of data small). The payload is shared with Daily
// Trends via DAILY_METRICS_KEY, so switching between the two doesn't refetch.

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Accounting-style currency - negatives as ($781.64) to match the legacy
// Power BI report; Tabulator's built-in money formatter puts the $ outside
// the parens.
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  currencySign: "accounting",
});

function accountingMoney(cell: CellComponent) {
  const v = cell.getValue();
  return typeof v === "number" ? usd.format(v) : "";
}

const money: Partial<ColumnDefinition> = {
  sorter: "number",
  hozAlign: "right",
  minWidth: 125,
  formatter: accountingMoney,
};

const txn: Partial<ColumnDefinition> = {
  ...money,
  bottomCalc: "sum",
  bottomCalcFormatter: accountingMoney,
};

const columns: ColumnDefinition[] = [
  {
    title: "CalendarDate",
    field: "calendar_date",
    frozen: true,
    width: 130,
    ...dateColumnProps,
    bottomCalc: () => "Total",
  },
  {
    title: "EOD Balances",
    columns: [
      { title: "Free Checking", field: "free_checking_balance", ...money },
      { title: "Money Market", field: "money_market_balance", ...money },
      { title: "Savings", field: "savings_balance", ...money },
      { title: "Credit Card", field: "credit_card_balance", ...money },
      { title: "Total", field: "total_balance", ...money },
    ],
  },
  {
    title: "EOD Transactions",
    cssClass: "section-divider",
    columns: [
      {
        title: "Free Checking",
        field: "free_checking_transaction_total",
        ...txn,
        cssClass: "section-divider",
      },
      { title: "Money Market", field: "money_market_transaction_total", ...txn },
      { title: "Savings", field: "savings_transaction_total", ...txn },
      { title: "Credit Card", field: "credit_card_transaction_total", ...txn },
      { title: "Total", field: "transaction_total", ...txn },
    ],
  },
  {
    title: "Free Day",
    field: "no_transactions_flag",
    sorter: "number",
    hozAlign: "center",
    width: 100,
    bottomCalc: "sum",
    cssClass: "section-divider",
  },
];

// Months that have data within the selected years; an empty year selection
// means all years (Power BI filter context).
function monthsInYears(data: DailyMetric[] | null | undefined, years: Set<string>): Set<number> {
  const months = new Set<number>();
  if (!data) return months;
  for (const d of data) {
    if (years.size === 0 || years.has(d.calendar_date.slice(0, 4))) {
      months.add(Number(d.calendar_date.slice(5, 7)));
    }
  }
  return months;
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// Power BI slicer click semantics: plain click selects just that item
// (clicking the only-selected item clears the selection back to "all");
// shift/ctrl-click toggles the item in or out of a multi-selection.
function slicerPick<T>(set: Set<T>, value: T, extend: boolean): Set<T> {
  if (extend) return toggled(set, value);
  if (set.size === 1 && set.has(value)) return new Set<T>();
  return new Set([value]);
}

export default function CheckBookPage() {
  const { data, status, error, isValidating, refetch } = useResource(
    DAILY_METRICS_KEY,
    getAllDailyMetrics,
  );
  // Empty selection = no filter = all years/months (Power BI filter context).
  const [selYears, setSelYears] = useState<Set<string>>(new Set());
  const [selMonths, setSelMonths] = useState<Set<number>>(new Set());

  const years = useMemo(() => {
    const unique = new Set((data ?? []).map((d) => d.calendar_date.slice(0, 4)));
    return [...unique].sort();
  }, [data]);

  const monthsWithData = useMemo(() => monthsInYears(data, selYears), [data, selYears]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.filter(
      (d) =>
        (selYears.size === 0 || selYears.has(d.calendar_date.slice(0, 4))) &&
        (selMonths.size === 0 || selMonths.has(Number(d.calendar_date.slice(5, 7)))),
    );
  }, [data, selYears, selMonths]);

  function pickYear(y: string, extend: boolean) {
    const next = slicerPick(selYears, y, extend);
    setSelYears(next);
    // Drop selected months that have no data under the new year scope (their
    // buttons become disabled and would otherwise be stuck selected).
    const avail = monthsInYears(data, next);
    setSelMonths((prev) => new Set([...prev].filter((m) => avail.has(m))));
  }

  function pickMonth(m: number, extend: boolean) {
    setSelMonths((prev) => slicerPick(prev, m, extend));
  }

  if (status === "error") return <ErrorState message={String(error)} onRetry={refetch} />;
  if (status === "loading") {
    return (
      <main style={{ padding: 24 }}>
        <h1>Check Book</h1>
        <div style={{ marginTop: 16 }}>
          <TableSkeleton rows={12} />
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <RefreshBar active={isValidating} />
      <h1>Check Book</h1>
      <div style={{ display: "flex", gap: 4, margin: "16px 0 8px" }}>
        {years.map((y) => (
          <button
            key={y}
            className={`slicer-btn${selYears.has(y) ? " active" : ""}`}
            style={{ flex: 1 }}
            onClick={(e) => pickYear(y, e.shiftKey || e.ctrlKey)}
          >
            {y}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {MONTH_LABELS.map((label, i) => {
          const m = i + 1;
          return (
            <button
              key={m}
              className={`slicer-btn${selMonths.has(m) ? " active" : ""}`}
              style={{ flex: 1 }}
              disabled={!monthsWithData.has(m)}
              onClick={(e) => pickMonth(m, e.shiftKey || e.ctrlKey)}
            >
              {label}
            </button>
          );
        })}
      </div>
      <DataTable
        data={rows}
        columns={columns}
        options={{
          layout: "fitColumns",
          height: "70vh",
          initialSort: [{ column: "calendar_date", dir: "desc" }],
        }}
      />
    </main>
  );
}
