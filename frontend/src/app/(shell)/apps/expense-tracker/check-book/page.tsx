"use client";

import { useMemo, useState } from "react";
import { DAILY_METRICS_KEY, getAllDailyMetrics } from "@/apps/expense-tracker/lib/api";
import { ErrorState } from "@/components/common/AsyncState";
import { DataTable } from "@/components/common/DataTable";
import { RefreshBar } from "@/components/common/progress";
import { TableSkeleton } from "@/components/common/skeletons";
import { dateColumnProps } from "@/apps/expense-tracker/lib/dates";
import { money, txn } from "@/apps/expense-tracker/lib/money";
import { inSlicerScope, monthsInYears, slicerPick } from "@/apps/expense-tracker/lib/slicer";
import { YearMonthSlicer } from "@/apps/expense-tracker/components/YearMonthSlicer";
import { useResource } from "@/lib/useResource";
import type { ColumnDefinition } from "tabulator-tables";

// The year/month slicers filter client-side so clicks are instant (one row per
// day keeps even a decade of data small). The payload is shared with Daily
// Trends via DAILY_METRICS_KEY, so switching between the two doesn't refetch.

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

export default function CheckBookPage() {
  const { data, status, error, isValidating, refetch } = useResource(
    DAILY_METRICS_KEY,
    getAllDailyMetrics,
  );
  // Empty selection = no filter = all years/months (Power BI filter context).
  const [selYears, setSelYears] = useState<Set<string>>(new Set());
  const [selMonths, setSelMonths] = useState<Set<number>>(new Set());

  const dates = useMemo(() => (data ?? []).map((d) => d.calendar_date), [data]);

  const rows = useMemo(
    () => (data ?? []).filter((d) => inSlicerScope(d.calendar_date, selYears, selMonths)),
    [data, selYears, selMonths],
  );

  function pickYear(y: string, extend: boolean) {
    const next = slicerPick(selYears, y, extend);
    setSelYears(next);
    // Drop selected months that have no data under the new year scope (their
    // buttons become disabled and would otherwise be stuck selected).
    const avail = monthsInYears(dates, next);
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
      <YearMonthSlicer
        dates={dates}
        selectedYears={selYears}
        selectedMonths={selMonths}
        onYearPick={pickYear}
        onMonthPick={pickMonth}
      />
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
