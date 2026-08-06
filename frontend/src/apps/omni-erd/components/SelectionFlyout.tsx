"use client";

import { Layers, X } from "lucide-react";
import { type ReactNode, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

import { buildSelect } from "../lib/buildSelect";
import type { SchemaGraph } from "../lib/types";
import { CopyButton } from "./CopyButton";
import { FlyoutPanel } from "./FlyoutPanel";

/**
 * The contextual inspector for a Ctrl-click multi-selection: the tables picked
 * so far, in pick order, and the `SELECT` that joins them.
 *
 * Shares `FlyoutPanel` with the single-table `DetailFlyout`, so switching
 * between the two cross-fades on the same frame. Each row names a table and
 * offers to drop it (mirroring a re-Ctrl-click); clicking the name drills into
 * that one table, which exits the multi-selection back to the normal
 * single-table flyout.
 *
 * A pick the query could not reach is flagged in the list as well as in the
 * warnings - but only when it is genuinely unrelated to every other pick.
 * `joinGroups` tells rows that join *each other* apart from rows that join
 * nothing, so a pair the canvas draws an edge between is never labelled "not
 * joined" merely because the statement can't reach both from the same root.
 *
 * The bridge control offers `remedyBridge` and nothing else - the very value
 * the warning's own sentence names - so the button cannot name a table the
 * prose above it does not, nor offer one that would leave the SQL unchanged.
 *
 * Height is split deliberately: the query takes whatever the panel has, while
 * the list is pinned to its content up to four rows. The query is the artefact
 * being copied out; the list is a summary of picks the user just made.
 */

const STAGGER_MS = 16;
const MAX_STAGGERED = 10;

/** SQL keywords worth calling out. Always emitted uppercase by `buildSelect`,
 *  so an exact-case match never fires on a lowercase identifier. */
const KEYWORDS = new Set(["SELECT", "FROM", "JOIN", "ON", "AND"]);

/** A quoted identifier (ANSI `"..."` or Databricks `` `...` ``, both with
 *  doubled-quote escaping) or a bare word. Quoted spans are never tested
 *  against `KEYWORDS`, so a table literally named `"order"` renders as plain
 *  text rather than as syntax. */
const TOKEN = /("(?:[^"]|"")*"|`(?:[^`]|``)*`|[A-Za-z_][A-Za-z0-9_]*)/g;

/** Splits one line of generated SQL into keyword and plain-text spans without
 *  adding, dropping or reordering a single character - the copy path reads
 *  `query.sql` directly, but the fallback selection reads this rendering, so
 *  it has to reproduce the source text exactly. */
function highlightSqlLine(line: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;
  TOKEN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(line))) {
    if (match.index > lastIndex) parts.push(line.slice(lastIndex, match.index));

    const token = match[0];
    const isQuoted = token.startsWith('"') || token.startsWith("`");
    parts.push(
      !isQuoted && KEYWORDS.has(token) ? (
        <span key={`${keyPrefix}-${tokenIndex++}`} className="font-bold">
          {token}
        </span>
      ) : (
        token
      ),
    );
    lastIndex = match.index + token.length;
  }
  if (lastIndex < line.length) parts.push(line.slice(lastIndex));
  return parts;
}

/** What a row's trailing tag should say, or nothing at all for a pick that
 *  made it into the statement. The tooltip spells every table the way the
 *  warnings beside it do - namespace-qualified - because a diagram can span
 *  schemas and two of them can hold a table of the same name. */
function rowLabel(
  entityId: string,
  rootName: string,
  group: readonly string[] | undefined,
  qualifiedName: (id: string) => string,
): { text: string; title?: string } | null {
  if (!group || group.length === 1) {
    return group ? { text: "not joined" } : null;
  }
  const others = group.filter((id) => id !== entityId).map(qualifiedName);
  return {
    text: "joins others",
    title: `${qualifiedName(entityId)} joins ${joinNames(others)}, but the query can't reach it from ${rootName}.`,
  };
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function SelectionFlyout({
  graph,
  selectedIds,
  onClose,
  onRemove,
  onSelect,
  onAddBridge,
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
  /** Adds an unpicked table to the selection - used for the suggested bridge. */
  onAddBridge: (entityId: string) => void;
}) {
  const reducedMotion = useReducedMotion();
  const byId = useMemo(() => new Map(graph.entities.map((entity) => [entity.id, entity])), [graph]);
  const query = useMemo(() => buildSelect(graph, selectedIds), [graph, selectedIds]);
  const groupIndexById = useMemo(() => {
    const map = new Map<string, number>();
    query.joinGroups.forEach((group, index) => {
      group.forEach((id) => map.set(id, index));
    });
    return map;
  }, [query]);
  const qualifiedName = (id: string) => {
    const entity = byId.get(id);
    return entity ? `${entity.namespace}.${entity.name}` : id;
  };
  const rootName = query.included.length > 0 ? qualifiedName(query.included[0]) : "";
  const remedy = query.remedyBridge;
  const sqlLines = useMemo(() => query.sql?.split("\n") ?? [], [query.sql]);

  const sqlRef = useRef<HTMLPreElement>(null);
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
          <p className="text-[11px] text-muted-foreground">
            Ctrl-click (⌘-click on Mac) a table to add or remove.
          </p>
        </>
      }
      flexibleRegion="footer"
      footer={
        <section className="flex min-h-0 flex-auto flex-col space-y-1.5">
          <div className="flex shrink-0 items-center justify-between gap-2">
            <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Query
            </h3>
            <CopyButton text={query.sql} label="Copy query" fallbackRef={sqlRef} />
          </div>

          {query.warnings.map((warning) => (
            <p
              key={warning.code}
              className="shrink-0 text-[11px] text-amber-600 dark:text-amber-500"
            >
              {warning.message}
            </p>
          ))}

          {remedy && (
            <Button
              variant="outline"
              size="sm"
              className="w-full shrink-0 justify-start"
              onClick={() => onAddBridge(remedy.entityId)}
            >
              Add {remedy.name}
            </Button>
          )}

          {query.sql && (
            <pre
              ref={sqlRef}
              className="min-h-0 flex-auto overflow-y-auto overflow-x-hidden rounded-md bg-muted/60 p-2 font-mono text-[12px] leading-[1.6] break-words whitespace-pre-wrap select-text"
            >
              {sqlLines.map((line, index) => (
                <div key={index} className="pl-[2ch] indent-[-2ch]">
                  {highlightSqlLine(line, `l${index}`)}
                </div>
              ))}
            </pre>
          )}
        </section>
      }
    >
      <ul className="max-h-[14rem] space-y-0.5 overflow-y-auto px-2 py-2">
        {selectedIds.map((id, index) => {
          const entity = byId.get(id);
          if (!entity) return null;
          const groupIndex = groupIndexById.get(id);
          const group = groupIndex === undefined ? undefined : query.joinGroups[groupIndex];
          const label = groupIndex === 0 ? null : rowLabel(id, rootName, group, qualifiedName);
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
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-[12px]" title={entity.name}>
                      {entity.name}
                    </span>
                    {label && (
                      <span
                        className="shrink-0 text-[10px] text-muted-foreground uppercase"
                        title={label.title}
                      >
                        {label.text}
                      </span>
                    )}
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
