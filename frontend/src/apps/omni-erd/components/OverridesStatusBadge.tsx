import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

import type { OverrideStatus } from "../lib/api";

/**
 * Whether a stored override still fits the catalog, and - when it does not -
 * the backend's own sentence naming what went missing.
 *
 * `detail` is printed verbatim on purpose. It names the exact table or column
 * (`datavault.Gold_X has no column accountsk`), which is the difference between
 * an admin repairing a stale override and an admin guessing which of its five
 * names a rebuild changed. Status is derived per read, never stored, so a row
 * that goes back to `active` after the next rebuild says so on its own.
 *
 * A non-active status pairs its color with an icon and its own label rather
 * than relying on color alone, so the difference survives colorblindness and
 * greyscale printing.
 */

const TONE: Record<
  OverrideStatus,
  { label: string; className: string; Icon: ComponentType<{ className?: string }> }
> = {
  active: {
    label: "Active",
    className: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
    Icon: CircleCheck,
  },
  unknown_entity: {
    label: "Missing table",
    className: "border-amber-500/50 text-amber-700 dark:text-amber-500",
    Icon: TriangleAlert,
  },
  unknown_column: {
    label: "Missing column",
    className: "border-amber-500/50 text-amber-700 dark:text-amber-500",
    Icon: TriangleAlert,
  },
  self_pair: {
    label: "Invalid pair",
    className: "border-destructive/50 text-destructive",
    Icon: OctagonAlert,
  },
};

export function OverridesStatusBadge({
  status,
  detail,
}: {
  status: OverrideStatus;
  detail: string;
}) {
  const tone = TONE[status];
  return (
    <div className="flex flex-col items-start gap-1">
      <span
        className={cn(
          "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
          tone.className,
        )}
      >
        <tone.Icon className="size-3" aria-hidden />
        {tone.label}
      </span>
      {detail !== "" && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  );
}
