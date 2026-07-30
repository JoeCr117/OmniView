"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { KeyRound, Link2 } from "lucide-react";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

import { NODE_HANDLE, handleId, visibleColumns, type TableNode as TableNodeType } from "../lib/toFlow";
import type { BaseType, EntityKind } from "../lib/types";
import { useErdActions } from "./actions";
import { MODE_META } from "./ModePills";

/**
 * One table on the canvas: a header naming the relation, then one row per
 * column - as many rows as the card's current mode calls for.
 *
 * Every rendered column carries a source and a target handle so an edge lands on
 * the *row* it belongs to rather than on the box. Both are rendered for every
 * column - React Flow needs the element to exist before an edge can attach, and
 * which side an edge uses isn't known here. Unconnected handles are invisible
 * (`opacity-0`) rather than absent, so nothing shifts when an edge appears.
 *
 * The card also carries a permanently-mounted pair of *node-level* handles.
 * Collapsing unmounts the column handles, and an edge whose handle disappears
 * strands itself at the node's origin; the fallback pair is what turns that into
 * a tidy box-to-box edge instead.
 */

const KIND_LABEL: Record<EntityKind, string> = {
  table: "table",
  view: "view",
  materialized_view: "materialized view",
  external_table: "external",
  unknown: "",
};

/** Colour by the *normalised* type, never the raw one - that is what makes the
 *  legend mean the same thing for Postgres and Databricks. */
const TYPE_CLASS: Record<BaseType, string> = {
  string: "text-emerald-600 dark:text-emerald-400",
  integer: "text-sky-600 dark:text-sky-400",
  decimal: "text-sky-600 dark:text-sky-400",
  float: "text-sky-600 dark:text-sky-400",
  boolean: "text-amber-600 dark:text-amber-400",
  date: "text-violet-600 dark:text-violet-400",
  timestamp: "text-violet-600 dark:text-violet-400",
  interval: "text-violet-600 dark:text-violet-400",
  binary: "text-rose-600 dark:text-rose-400",
  json: "text-fuchsia-600 dark:text-fuchsia-400",
  array: "text-fuchsia-600 dark:text-fuchsia-400",
  struct: "text-fuchsia-600 dark:text-fuchsia-400",
  uuid: "text-teal-600 dark:text-teal-400",
  unknown: "text-muted-foreground",
};

/** Rows fade in on a stagger, capped so a 40-column table doesn't ripple for
 *  most of a second. */
const STAGGER_MS = 12;
const MAX_STAGGERED_ROWS = 8;

export function TableNode({ id, data, selected }: NodeProps<TableNodeType>) {
  const { entity, connectedColumns, keyRoles, mode } = data;
  const { cycleMode } = useErdActions();
  const reducedMotion = useReducedMotion();
  const { shown, hidden } = visibleColumns(entity, connectedColumns, mode);
  const { Icon: ModeIcon, label: modeLabel } = MODE_META[mode];

  return (
    <div
      className={cn(
        "w-[260px] overflow-hidden rounded-md border bg-card shadow-sm",
        !reducedMotion && "transition-[border-color,box-shadow] duration-150",
        selected ? "border-primary ring-1 ring-primary" : "border-border",
      )}
      data-testid={`erd-node-${entity.id}`}
      data-mode={mode}
    >
      {/* The card-level fallback pair: always mounted, never visible. */}
      <Handle
        type="target"
        position={Position.Left}
        id={NODE_HANDLE.target}
        className="!top-5 !h-2 !w-2 !border !bg-muted-foreground !opacity-0"
      />
      <Handle
        type="source"
        position={Position.Right}
        id={NODE_HANDLE.source}
        className="!top-5 !h-2 !w-2 !border !bg-muted-foreground !opacity-0"
      />

      <div className="flex items-center justify-between gap-1.5 border-b bg-muted/60 px-2.5 py-2">
        <span className="truncate font-mono text-[13px] font-semibold" title={entity.name}>
          {entity.name}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {KIND_LABEL[entity.kind] && (
            <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
              {KIND_LABEL[entity.kind]}
            </span>
          )}
          <button
            type="button"
            // nodrag keeps React Flow from treating the press as the start of a
            // drag, which would swallow the click entirely.
            className={cn(
              "nodrag flex size-5 items-center justify-center rounded text-muted-foreground",
              "hover:bg-background hover:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              !reducedMotion && "transition-[background-color,color,transform] duration-150 active:scale-90",
            )}
            onClick={(event) => {
              event.stopPropagation();
              cycleMode(id);
            }}
            // Keyboard activation is handled explicitly rather than left to the
            // browser's synthesised click. React Flow's node wrapper is itself
            // focusable and handles keys, and something in that chain cancels
            // the default activation - so a focused toggle simply did nothing on
            // Enter, and the control was mouse-only. Caught by the e2e spec.
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              cycleMode(id);
            }}
            aria-label={`Columns: ${modeLabel}. Click to change.`}
            title={`Columns: ${modeLabel}`}
          >
            <ModeIcon className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {/* 0fr -> 1fr transitions to the content's natural height without anyone
          having to measure it. */}
      <div
        className={cn(
          "grid",
          !reducedMotion && "transition-[grid-template-rows] duration-200 ease-out",
        )}
        style={{ gridTemplateRows: mode === "none" ? "0fr" : "1fr" }}
      >
        <div className="overflow-hidden">
          <div className="py-0.5">
            {shown.map((column, index) => {
              const connected = connectedColumns.has(column.name);
              const key = keyRoles.get(column.name);
              return (
                <div
                  key={column.name}
                  className={cn(
                    "relative flex h-6 items-center gap-1.5 px-2.5 text-[11px]",
                    !reducedMotion && "animate-in fade-in duration-200",
                  )}
                  style={
                    reducedMotion
                      ? undefined
                      : { animationDelay: `${Math.min(index, MAX_STAGGERED_ROWS) * STAGGER_MS}ms` }
                  }
                  title={column.comment ?? undefined}
                >
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={handleId(column.name, "target")}
                    className={cn("!h-2 !w-2 !border !bg-muted-foreground", !connected && "!opacity-0")}
                  />

                  {/* Icon and tag are both driven by the *derived* role, not the
                      raw column flag - that is what makes them light up on
                      datavault, whose keys exist only as inferred edges. */}
                  {key?.role === "pk" ? (
                    <KeyRound className="size-3 shrink-0 text-amber-500" aria-label="primary key" />
                  ) : key?.role === "fk" ? (
                    <Link2 className="size-3 shrink-0 text-sky-500" aria-label="foreign key" />
                  ) : (
                    <span className="size-3 shrink-0" aria-hidden />
                  )}

                  <span className={cn("flex-1 truncate font-mono", key?.role === "pk" && "font-semibold")}>
                    {column.name}
                    {!column.nullable && <span className="text-muted-foreground"> *</span>}
                  </span>

                  {key && (
                    <span
                      className={cn(
                        "shrink-0 rounded-sm px-1 font-mono text-[9px] font-semibold uppercase leading-[1.4]",
                        key.role === "pk"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                        // A guess is dimmed, matching the dashed inferred edges.
                        key.inferred && "opacity-70",
                        !reducedMotion && "animate-in fade-in zoom-in-95 duration-200",
                      )}
                      data-key-role={key.role}
                      title={
                        key.inferred
                          ? `${key.role.toUpperCase()} — inferred from naming`
                          : `${key.role.toUpperCase()} — declared`
                      }
                    >
                      {key.role}
                    </span>
                  )}

                  <span
                    className={cn("shrink-0 font-mono text-[10px]", TYPE_CLASS[column.type.base])}
                    title={column.type.raw}
                  >
                    {column.type.base}
                  </span>

                  <Handle
                    type="source"
                    position={Position.Right}
                    id={handleId(column.name, "source")}
                    className={cn("!h-2 !w-2 !border !bg-muted-foreground", !connected && "!opacity-0")}
                  />
                </div>
              );
            })}

            {hidden > 0 && mode !== "none" && (
              <div
                className="flex h-6 items-center px-2.5 text-[11px] text-muted-foreground italic"
                title={entity.columns
                  .filter((column) => !shown.includes(column))
                  .map((column) => column.name)
                  .join(", ")}
              >
                +{hidden} more {hidden === 1 ? "column" : "columns"}
              </div>
            )}

            {entity.columns.length === 0 && mode !== "none" && (
              <div className="px-2.5 py-2 text-[11px] text-muted-foreground">no columns</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
