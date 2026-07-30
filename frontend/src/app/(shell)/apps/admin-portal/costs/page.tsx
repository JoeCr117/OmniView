"use client";

import { useState } from "react";

import {
  describeDatabricksError,
  NotConnectedCard,
} from "@/apps/admin-portal/components/NotConnectedCard";
import { getCostsOverview, type CostDays } from "@/apps/admin-portal/lib/api";
import { LazyTimeSeriesChart } from "@/components/charts/LazyTimeSeriesChart";
import { ErrorState } from "@/components/common/AsyncState";
import { KpiCard } from "@/components/common/KpiCard";
import { RefreshBar } from "@/components/common/progress";
import { ChartSkeleton, KpiSkeleton, TableSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { useResource } from "@/lib/useResource";

const DAY_CHOICES: CostDays[] = [7, 30, 90];

/** 2026-07-14 -> "Jul 14". A cost window is at most 90 days, so the year is noise. */
const shortDate = (value: string | number) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const dbus = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function CostsPage() {
  const [days, setDays] = useState<CostDays>(30);
  // Each window is cached under its own key, so flipping 7/30/90 back to a
  // window you've already loaded paints instantly instead of blanking.
  const { data, status, error, isValidating, refetch } = useResource(
    `admin-portal:costs:${days}`,
    () => getCostsOverview(days),
  );

  const content = () => {
    if (status === "error") {
      const kind = describeDatabricksError(error);
      if (kind) return <NotConnectedCard kind={kind} />;
      return <ErrorState message={String(error)} onRetry={refetch} />;
    }
    if (status === "loading" || !data) {
      return (
        <div className="flex flex-col gap-8">
          <KpiSkeleton count={3} />
          <ChartSkeleton />
          <TableSkeleton rows={5} />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            label={`DBUs (last ${data.kpis.days} days)`}
            value={data.kpis.total_dbus.toFixed(2)}
          />
          <KpiCard
            label="List-price value (USD)"
            value={`$${data.kpis.list_cost_usd.toFixed(2)}`}
            caption="Free Edition — actual cost is $0"
          />
          <KpiCard label="Top SKU by DBUs" value={data.kpis.top_sku ?? "—"} />
        </div>

        <section>
          <h2 className="mb-2 text-lg font-semibold">Daily DBU usage</h2>
          {/* The chart owns its own empty state, so there's no guard here. */}
          <LazyTimeSeriesChart
            ariaLabel={`Databricks DBU usage per day over the last ${data.kpis.days} days`}
            series={[
              {
                key: "dbus",
                label: "DBUs",
                points: data.daily.map((row) => ({ x: row.date, y: row.dbus })),
              },
            ]}
            x={{ label: "Date", format: shortDate }}
            y={{ label: "Usage", unit: "DBUs", format: dbus }}
            emptyMessage="No usage recorded in this window."
          />
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold">By SKU</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">DBUs</th>
                  <th className="px-4 py-3 font-medium">List-price USD</th>
                </tr>
              </thead>
              <tbody>
                {data.by_sku.map((row) => (
                  <tr key={row.sku} className="border-t">
                    <td className="px-4 py-3 font-medium">{row.sku}</td>
                    <td className="px-4 py-3 tabular-nums">{row.dbus.toFixed(4)}</td>
                    <td className="px-4 py-3 tabular-nums">${row.list_cost_usd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  };

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <RefreshBar active={isValidating} className="mb-2" />
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Costs</h1>
        <div className="flex gap-1" role="group" aria-label="Time window">
          {DAY_CHOICES.map((choice) => (
            <Button
              key={choice}
              size="sm"
              variant={choice === days ? "default" : "outline"}
              onClick={() => setDays(choice)}
            >
              {choice}d
            </Button>
          ))}
        </div>
      </div>
      {content()}
    </main>
  );
}
