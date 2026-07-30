"use client";

import { cn } from "@/lib/utils";

import type { ErdSource } from "../lib/types";

/**
 * Which schema is on the canvas.
 *
 * One button per (source, namespace) pair rather than two dropdowns: there are
 * three of them, and a source that exposes no namespaces (an unconfigured
 * Databricks catalog) has to be visible-but-unselectable so it reads as "not
 * set up yet" rather than as missing.
 */
export interface SourceSelection {
  sourceId: string;
  namespace: string;
}

export function SourcePicker({
  sources,
  selected,
  onSelect,
}: {
  sources: ErdSource[];
  selected: SourceSelection | null;
  onSelect: (selection: SourceSelection) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-6 py-2.5">
      {sources.map((source) =>
        source.namespaces.length === 0 ? (
          <span
            key={source.id}
            title={source.description}
            className="cursor-not-allowed rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground"
          >
            {source.label}
            <span className="ml-1.5 text-xs">not configured</span>
          </span>
        ) : (
          source.namespaces.map((namespace) => {
            const active =
              selected?.sourceId === source.id && selected?.namespace === namespace;
            return (
              <button
                key={`${source.id}:${namespace}`}
                type="button"
                onClick={() => onSelect({ sourceId: source.id, namespace })}
                aria-pressed={active}
                title={source.description}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/10 font-semibold"
                    : "hover:bg-muted",
                )}
              >
                {source.label}
                <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                  {namespace}
                </span>
              </button>
            );
          })
        ),
      )}
    </div>
  );
}
