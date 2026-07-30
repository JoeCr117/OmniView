"use client";

import { Layers, X } from "lucide-react";
import { useMemo } from "react";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

import type { SchemaGraph } from "../lib/types";
import { FlyoutPanel } from "./FlyoutPanel";

/**
 * The contextual inspector for a Ctrl-click multi-selection: the tables picked
 * so far, in pick order.
 *
 * Shares `FlyoutPanel` with the single-table `DetailFlyout`, so switching
 * between the two cross-fades on the same frame. For now it is a list - each row
 * names a table and offers to drop it (mirroring a re-Ctrl-click); clicking the
 * name drills into that one table, which exits the multi-selection back to the
 * normal single-table flyout.
 */

const STAGGER_MS = 16;
const MAX_STAGGERED = 10;

export function SelectionFlyout({
  graph,
  selectedIds,
  onClose,
  onRemove,
  onSelect,
}: {
  graph: SchemaGraph;
  /** Selected entity ids in the order they were Ctrl-clicked. */
  selectedIds: string[];
  /** Clears the whole selection. */
  onClose: () => void;
  /** Drops one table (same effect as Ctrl-clicking it again). */
  onRemove: (entityId: string) => void;
  /** Inspects one table singly, exiting the multi-selection. */
  onSelect: (entityId: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const byId = useMemo(() => new Map(graph.entities.map((entity) => [entity.id, entity])), [graph]);
  const count = selectedIds.length;

  return (
    <FlyoutPanel
      ariaLabel={`${count} ${count === 1 ? "table" : "tables"} selected`}
      onClose={onClose}
      closeLabel="Clear selection"
      header={
        <>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Layers className="size-3.5 text-muted-foreground" aria-hidden />
            {count} {count === 1 ? "table" : "tables"} selected
          </p>
          <p className="text-[11px] text-muted-foreground">Ctrl-click a table to add or remove.</p>
        </>
      }
    >
      <ul className="space-y-0.5 px-2 py-2">
        {selectedIds.map((id, index) => {
          const entity = byId.get(id);
          if (!entity) return null;
          return (
            <li
              key={id}
              className={cn(!reducedMotion && "animate-in fade-in slide-in-from-right-2 duration-200")}
              style={
                reducedMotion
                  ? undefined
                  : { animationDelay: `${Math.min(index, MAX_STAGGERED) * STAGGER_MS}ms` }
              }
            >
              <div className="group flex items-center gap-1 rounded-md border border-transparent pr-1 transition-colors hover:border-border hover:bg-muted/60">
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="block truncate font-mono text-[12px]" title={entity.name}>
                    {entity.name}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {entity.namespace}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  aria-label={`Remove ${entity.name}`}
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground",
                    "hover:bg-background hover:text-foreground",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    !reducedMotion &&
                      "transition-[background-color,color,transform] duration-150 active:scale-90",
                  )}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </FlyoutPanel>
  );
}
