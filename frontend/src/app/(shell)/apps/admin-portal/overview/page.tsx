"use client";

import { getPortalOverview } from "@/apps/admin-portal/lib/api";
import { ErrorState } from "@/components/common/AsyncState";
import { KpiCard } from "@/components/common/KpiCard";
import { RefreshBar } from "@/components/common/progress";
import { KpiSkeleton } from "@/components/common/skeletons";
import { useResource } from "@/lib/useResource";

export default function OverviewPage() {
  const { data, status, error, isValidating, refetch } = useResource(
    "admin-portal:overview",
    getPortalOverview,
  );

  if (status === "error") {
    return (
      <main className="mx-auto w-full max-w-6xl p-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Overview</h1>
        <ErrorState message={String(error)} onRetry={refetch} />
      </main>
    );
  }
  if (status === "loading" || !data) {
    return (
      <main className="mx-auto w-full max-w-6xl p-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Overview</h1>
        <KpiSkeleton count={4} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <RefreshBar active={isValidating} className="mb-2" />
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Overview</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Users" value={data.users.total} href="/apps/admin-portal/users" />
        <KpiCard label="Admins" value={data.users.admins} href="/apps/admin-portal/users" />
        <KpiCard
          label="Running / failed jobs"
          value={data.jobs ? `${data.jobs.running} / ${data.jobs.failed}` : "—"}
          href="/apps/admin-portal/jobs"
          caption={data.connected ? undefined : "Databricks not connected"}
        />
        <KpiCard
          label="DBUs (30 days)"
          value={data.dbus_30d !== null ? data.dbus_30d.toFixed(2) : "—"}
          href="/apps/admin-portal/costs"
          caption={data.connected ? "Free Edition — actual cost $0" : "Databricks not connected"}
        />
      </div>
    </main>
  );
}
