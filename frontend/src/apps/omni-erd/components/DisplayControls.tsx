"use client";

import { LayoutGrid, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOverlayContainer } from "@/hooks/useOverlayContainer";

import type { ColumnMode, ViewState } from "../lib/displayMode";
import { ModePills } from "./ModePills";

/**
 * How much of every table to show, and a way to put the diagram back in order.
 *
 * Renders bare, not wrapped in a `<Panel>`: it shares the top-left corner with
 * the search control, and two Panels at the same position would sit on top of
 * each other. `ErdCanvas` owns the one Panel that holds both.
 */
export function DisplayControls({
  view,
  onDefaultMode,
  onReset,
  overrideCount,
}: {
  view: ViewState;
  onDefaultMode: (mode: ColumnMode) => void;
  onReset: () => void;
  overrideCount: number;
}) {
  const container = useOverlayContainer();

  return (
    <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" aria-label="Display options">
            <SlidersHorizontal className="size-4" aria-hidden />
            Display
          </Button>
        </PopoverTrigger>

        <PopoverContent container={container} className="w-72 space-y-4">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium">Columns</p>
              {overrideCount > 0 && (
                // Otherwise "why is that one card still expanded?" has no
                // answer visible anywhere on screen.
                <p className="text-[11px] text-muted-foreground">
                  {overrideCount} card{overrideCount === 1 ? "" : "s"} overridden
                </p>
              )}
            </div>
            <ModePills value={view.defaultMode} onChange={onDefaultMode} />
            <p className="text-[11px] text-muted-foreground">
              Applies to every table and clears any per-card overrides.
            </p>
          </div>

          <div className="space-y-2 border-t pt-3">
            <Button variant="outline" size="sm" className="w-full" onClick={onReset}>
              <LayoutGrid className="size-4" aria-hidden />
              Reset view
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Re-arranges every table at its current size and fits the diagram to
              the screen.
            </p>
          </div>
      </PopoverContent>
    </Popover>
  );
}
