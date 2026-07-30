"use client";

import type { ColumnDefinition } from "tabulator-tables";

import { DAILY_METRICS_KEY, getAllDailyMetrics } from "@/apps/expense-tracker/lib/api";
import { dateColumnProps } from "@/apps/expense-tracker/lib/dates";
import { LazyTimeSeriesChart } from "@/components/charts/LazyTimeSeriesChart";
import { ErrorState } from "@/components/common/AsyncState";
import { DataTable } from "@/components/common/DataTable";
import { ChartSkeleton, TableSkeleton } from "@/components/common/skeletons";
import { RefreshBar } from "@/components/common/progress";
import { useResource } from "@/lib/useResource";

const usd = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** 2024-03-07 -> "Mar 7, 2024". Ticks get the short form; the tooltip the full one. */
const shortDate = (value: string | number) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

const columns: ColumnDefinition[] = [
  { title: "Date", field: "calendar_date", ...dateColumnProps, width: 140 },
  {
    title: "Transaction Total",
    field: "transaction_total",
    sorter: "number",
    hozAlign: "right",
    formatter: "money",
    formatterParams: { precision: 2 },
  },
  {
    title: "Total Balance",
    field: "total_balance",
    sorter: "number",
    hozAlign: "right",
    formatter: "money",
    formatterParams: { precision: 2 },
  },
];

export default function DailyTrendsPage() {
  const { data, status, error, isValidating, refetch } = useResource(
    DAILY_METRICS_KEY,
    getAllDailyMetrics,
  );

  if (status === "error") return <ErrorState message={String(error)} onRetry={refetch} />;
  if (status === "loading") {
    // First visit only: on a revisit the cached data paints and we show the
    // RefreshBar instead of tearing the page down.
    return (
      <main className="mx-auto w-full max-w-6xl p-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Daily Trends</h1>
        <ChartSkeleton />
        <div className="mt-6">
          <TableSkeleton />
        </div>
      </main>
    );
  }

  const rows = data ?? [];
  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <RefreshBar active={isValidating} className="mb-2" />
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Daily Trends</h1>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Total balance over time</h2>
        <LazyTimeSeriesChart
          ariaLabel="Total balance over time"
          series={[
            {
              key: "balance",
              label: "Total balance",
              points: rows.map((d) => ({ x: d.calendar_date, y: d.total_balance ?? 0 })),
            },
          ]}
          x={{ label: "Date", format: shortDate }}
          y={{ label: "Balance", unit: "USD", format: usd }}
        />
      </section>

      <div className="mt-6">
        <DataTable
          data={rows}
          columns={columns}
          options={{ layout: "fitColumns", pagination: true, paginationSize: 50 }}
        />
      </div>
    </main>
  );
}
