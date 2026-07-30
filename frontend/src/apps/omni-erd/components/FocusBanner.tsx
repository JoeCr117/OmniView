"use client";

import { Panel } from "@xyflow/react";
import { Crosshair, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

/**
 * "Showing 3 of 22" - the way out of focus mode, and the answer to "why is my
 * diagram half empty".
 *
 * Bottom-centre rather than the top-right the plan called for: the detail panel
 * took that corner, and the two would have stacked. Bottom-centre is the only
 * free edge (controls are bottom-left, minimap bottom-right) and is where a
 * status bar belongs anyway.
 *
 * The count is not decoration. Focusing the hub of a star hides almost nothing,
 * and without a number on screen that reads as a broken button rather than as
 * an honest answer about the schema's shape.
 */
export function FocusBanner({
  entityName,
  visible,
  total,
  onClear,
}: {
  entityName: string;
  visible: number;
  total: number;
  onClear: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const hidesNothing = visible === total;

  return (
    <Panel
      position="bottom-center"
      className={cn(
        "flex items-center gap-2 rounded-full bg-popover py-1.5 pr-1.5 pl-3 text-popover-foreground shadow-md ring-1 ring-foreground/10",
        !reducedMotion && "animate-in fade-in slide-in-from-bottom-2 duration-200",
      )}
      role="status"
    >
      <Crosshair className="size-3.5 shrink-0 text-primary" aria-hidden />
      <span className="text-[12px]">
        <span className="font-mono font-semibold">{entityName}</span>
        <span className="text-muted-foreground">
          {" · "}
          showing {visible} of {total}
          {hidesNothing && " — it touches everything"}
        </span>
      </span>
      <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Show all tables">
        <X />
      </Button>
    </Panel>
  );
}
