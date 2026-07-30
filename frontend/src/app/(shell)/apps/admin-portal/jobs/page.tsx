"use client";

import {
  describeDatabricksError,
  NotConnectedCard,
} from "@/apps/admin-portal/components/NotConnectedCard";
import { getJobsOverview, type JobRun } from "@/apps/admin-portal/lib/api";
import { ErrorState } from "@/components/common/AsyncState";
import { KpiCard } from "@/components/common/KpiCard";
import { RefreshBar } from "@/components/common/progress";
import { KpiSkeleton, TableSkeleton } from "@/components/common/skeletons";
import { useResource } from "@/lib/useResource";

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function RunsTable({ title, runs, empty }: { title: string; runs: JobRun[]; empty: string }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.run_id} className="border-t">
                  <td className="px-4 py-3">
                    {run.run_page_url ? (
                      <a
                        href={run.run_page_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {run.job_name}
                      </a>
                    ) : (
                      <span className="font-medium">{run.job_name}</span>
                    )}
                    <span className="block text-xs text-muted-foreground">run {run.run_id}</span>
                  </td>
                  <td className="px-4 py-3">{run.result_state ?? run.life_cycle_state}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {run.start_time ? new Date(run.start_time).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatDuration(run.duration_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function JobsPage() {
  const { data, status, error, isValidating, refetch } = useResource(
    "admin-portal:jobs",
    getJobsOverview,
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
          <KpiSkeleton count={4} />
          <TableSkeleton rows={4} />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Jobs" value={data.counts.jobs} />
          <KpiCard label="Running" value={data.counts.running} />
          <KpiCard label="Completed (recent)" value={data.counts.completed} />
          <KpiCard label="Failed (recent)" value={data.counts.failed} />
        </div>
        <RunsTable title="Running" runs={data.running} empty="No runs in progress." />
        <RunsTable title="Failed" runs={data.failed} empty="No recent failures." />
        <RunsTable title="Completed" runs={data.completed} empty="No recent completed runs." />
      </div>
    );
  };

  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <RefreshBar active={isValidating} className="mb-2" />
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Jobs</h1>
      {content()}
    </main>
  );
}
