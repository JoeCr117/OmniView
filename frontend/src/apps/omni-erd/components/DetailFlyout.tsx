"use client";

import { ArrowLeftToLine, ArrowRightFromLine, Crosshair, KeyRound } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

import { type RelatedEntity, confidenceLabel, entityDetail } from "../lib/entityDetail";
import type { SchemaGraph } from "../lib/types";
import { FlyoutPanel } from "./FlyoutPanel";

/**
 * The inspector: everything about one relation that the card is too small to
 * say. Rendered inside the shared `FlyoutPanel` shell, so its frame, geometry
 * and animation are identical to the multi-select `SelectionFlyout`.
 */

const KIND_LABEL: Record<string, string> = {
  table: "Table",
  view: "View",
  materialized_view: "Materialized view",
  external_table: "External table",
  unknown: "Relation",
};

function RelationshipRow({
  related,
  onSelect,
}: {
  related: RelatedEntity;
  onSelect: (entityId: string) => void;
}) {
  const confidence = confidenceLabel(related);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(related.entityId)}
        className="w-full rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-[12px]">{related.entityName}</span>
          {related.selfReference && (
            <span className="shrink-0 text-[10px] text-muted-foreground uppercase">self</span>
          )}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
          {related.localColumns.join(", ")} → {related.remoteColumns.join(", ")}
        </span>
        {confidence && (
          // The inference note only ever appeared as a percentage on the edge
          // label; this is the first place the actual reasoning is legible.
          <span className="mt-0.5 block text-[11px] text-amber-600 dark:text-amber-500">
            {confidence}
            {related.note ? ` — ${related.note}` : ""}
          </span>
        )}
      </button>
    </li>
  );
}

function Section({
  title,
  icon: Icon,
  items,
  empty,
  onSelect,
}: {
  title: string;
  icon: typeof ArrowRightFromLine;
  items: RelatedEntity[];
  empty: string;
  onSelect: (entityId: string) => void;
}) {
  return (
    <section className="space-y-1">
      <h3 className="flex items-center gap-1.5 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" aria-hidden />
        {title}
        <span className="font-mono normal-case">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="px-2 text-[11px] text-muted-foreground italic">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((related) => (
            <RelationshipRow key={related.relationshipId} related={related} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function DetailFlyout({
  graph,
  entityId,
  focusedId,
  onClose,
  onSelect,
  onFocus,
}: {
  graph: SchemaGraph;
  /** null closes the panel. */
  entityId: string | null;
  /** Which relation the canvas is currently focused on, if any. */
  focusedId: string | null;
  onClose: () => void;
  onSelect: (entityId: string) => void;
  onFocus: (entityId: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const detail = useMemo(
    () => (entityId ? entityDetail(graph, entityId) : null),
    [graph, entityId],
  );

  if (!detail) return null;

  return (
    <FlyoutPanel
      ariaLabel={`Details for ${detail.entity.name}`}
      onClose={onClose}
      closeLabel="Close details"
      header={
        <>
          <p className="truncate font-mono text-[13px] font-semibold" title={detail.entity.name}>
            {detail.entity.name}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {KIND_LABEL[detail.entity.kind] ?? KIND_LABEL.unknown} in{" "}
            <span className="font-mono">{detail.entity.namespace}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Ctrl-click (⌘-click on Mac) a table to add or remove.
          </p>
        </>
      }
      footer={
        <>
          <Button
            variant={focusedId === detail.entity.id ? "default" : "secondary"}
            size="sm"
            className="w-full"
            onClick={() => onFocus(detail.entity.id)}
            disabled={focusedId === detail.entity.id}
          >
            <Crosshair className="size-4" aria-hidden />
            {focusedId === detail.entity.id ? "Focused" : "Focus"}
          </Button>
          <p className="mt-1 text-center text-[11px] text-muted-foreground">
            {detail.neighbourIds.length === 0
              ? "Nothing is joined to this relation."
              : `Hides all but its ${detail.neighbourIds.length} linked relation${
                  detail.neighbourIds.length === 1 ? "" : "s"
                }.`}
          </p>
        </>
      }
    >
      <div
        // Keyed on the entity so switching tables cross-fades the body rather
        // than swapping it abruptly.
        key={detail.entity.id}
        className={cn(
          "space-y-3 px-3 py-3",
          !reducedMotion && "animate-in fade-in duration-200",
        )}
      >
        {detail.entity.comment && (
          <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px]">{detail.entity.comment}</p>
        )}

        <dl className="grid grid-cols-3 gap-1.5 text-center">
          {(
            [
              ["Columns", detail.columnCount],
              ["Keys", detail.keyColumns.length],
              ["Linked", detail.neighbourIds.length],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-md border px-1.5 py-1">
              <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</dt>
              <dd className="font-mono text-sm">{value}</dd>
            </div>
          ))}
        </dl>

        {detail.entity.primary_key ? (
          <section className="space-y-1">
            <h3 className="flex items-center gap-1.5 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              <KeyRound className="size-3.5 text-amber-500" aria-hidden />
              Primary key
            </h3>
            <p className="px-2 font-mono text-[12px]">
              {detail.entity.primary_key.columns.join(", ")}
            </p>
          </section>
        ) : (
          <p className="px-2 text-[11px] text-muted-foreground italic">No declared primary key.</p>
        )}

        <Section
          title="References"
          icon={ArrowRightFromLine}
          items={detail.references}
          empty="This relation points at nothing."
          onSelect={onSelect}
        />
        <Section
          title="Referenced by"
          icon={ArrowLeftToLine}
          items={detail.referencedBy}
          empty="Nothing points at this relation."
          onSelect={onSelect}
        />
      </div>
    </FlyoutPanel>
  );
}
