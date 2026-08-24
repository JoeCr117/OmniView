"use client";

import { ChevronDown, ChevronUp, ListTree } from "lucide-react";
import type { ReactNode } from "react";

import type { Dimension } from "@/apps/expense-tracker/lib/breakdown";
import {
  canDrillDown,
  canDrillUp,
  drillUp,
  skipToNextLevel,
  type DrillState,
} from "@/apps/expense-tracker/lib/drill";
import { Button } from "@/components/ui/button";

/**
 * The drill controls every Breakdown visual carries, in the order Power BI puts
 * them: up, drill-down mode, then go-to-next-level. Anything a particular visual
 * adds (the matrix's expand-all) slots in as `children`, which is why the
 * next-level button is rendered after them.
 *
 * The distinction the two downward controls draw is the whole point: drill-down
 * mode makes a click descend **into** that mark and filter to it; next level
 * descends without filtering anything.
 */
export function DrillToolbar({
  drill,
  hierarchy,
  onDrill,
  drillMode,
  onDrillModeChange,
  children,
  status,
}: {
  drill: DrillState;
  hierarchy: readonly Dimension[];
  onDrill: (next: DrillState) => void;
  drillMode: boolean;
  onDrillModeChange: (next: boolean) => void;
  /** Visual-specific controls, rendered between drill-down and next-level. */
  children?: ReactNode;
  /** A short line of context, e.g. how many rows are showing. */
  status?: ReactNode;
}) {
  const canDown = canDrillDown(drill, hierarchy);

  return (
    <div className="mb-2 flex items-center gap-1">
      <ToolbarButton
        label="Drill up"
        icon={<ChevronUp />}
        disabled={!canDrillUp(drill)}
        onClick={() => onDrill(drillUp(drill))}
      />
      <ToolbarButton
        label="Drill down: click a mark to descend into it"
        icon={<ChevronDown />}
        pressed={drillMode}
        disabled={!canDown}
        onClick={() => onDrillModeChange(!drillMode)}
      />
      {children}
      <ToolbarButton
        label="Go to the next level in the hierarchy"
        icon={<ListTree />}
        disabled={!canDown}
        onClick={() => onDrill(skipToNextLevel(drill, hierarchy))}
      />
      {status ? <span className="ml-2 text-xs text-muted-foreground">{status}</span> : null}
    </div>
  );
}

export function ToolbarButton({
  label,
  icon,
  onClick,
  disabled,
  pressed,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <Button
      variant={pressed ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}
