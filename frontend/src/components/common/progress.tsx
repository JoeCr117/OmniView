"use client";

import { cn } from "@/lib/utils";

/**
 * Two progress affordances, both token-styled and both accessible.
 *
 * The distinction matters for QOL5: show *determinate* progress only when you
 * can actually measure it (a file upload's byte count), and *indeterminate*
 * progress - a moving sliver, no false percentage - when you can't (a
 * background refetch, a multi-minute rebuild). A determinate bar stuck at some
 * arbitrary percentage is a lie; an indeterminate one is honest.
 */

/**
 * A thin sliver that animates across the top of a still-populated surface while
 * it refreshes underneath. This is what replaces `setData(null)` + "Loading…":
 * the stale content stays put, and this says "working" without a layout shift.
 */
export function RefreshBar({ active, className }: { active: boolean; className?: string }) {
  return (
    <div
      className={cn("h-0.5 w-full overflow-hidden", className)}
      role="status"
      aria-live="polite"
      aria-label={active ? "Refreshing" : undefined}
    >
      {active && <div className="h-full w-1/3 animate-[refreshbar_1.1s_ease-in-out_infinite] bg-primary" />}
    </div>
  );
}

/** A determinate bar for a known fraction in [0, 1]; `null` fraction = busy. */
export function ProgressBar({
  fraction,
  label,
  className,
}: {
  fraction: number | null;
  label?: string;
  className?: string;
}) {
  const pct = fraction === null ? null : Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {pct === null ? (
        <div className="h-full w-1/3 animate-[refreshbar_1.1s_ease-in-out_infinite] bg-primary" />
      ) : (
        <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${pct}%` }} />
      )}
    </div>
  );
}
