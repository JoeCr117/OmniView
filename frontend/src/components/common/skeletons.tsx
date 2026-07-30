import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Placeholders shaped like the content they stand in for.
 *
 * The point is layout stability: a skeleton the size of the incoming chart or
 * table means the page doesn't jump when data lands, and the user can see what
 * is coming rather than reading the word "Loading". Use these on a *first*
 * load; on a refetch of already-cached data, keep the stale content on screen
 * and show progress instead (that is what QOL5's useResource does).
 */

export function KpiSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border p-4">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-3 h-7 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border p-4", className)}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-[220px] w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2" data-testid="table-skeleton">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
