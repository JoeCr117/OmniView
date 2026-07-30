"use client";

import { Command as CommandK } from "cmdk";
import { Search, Table2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

import { type SearchEntry, buildIndex, searchEntries } from "../lib/searchIndex";
import type { SchemaGraph } from "../lib/types";

/**
 * Jump to any table or column by name.
 *
 * Lives inside the top-left toolbar pill (`ErdCanvas` owns the box): collapsed to
 * a single icon that shares the pill with the Display control, and expanding *in
 * place* to a full-width field on click - the pill grows to hold it while Display
 * slides along, and the results float below.
 *
 * The field is a bare `cmdk` input rather than the shared `CommandInput`, so it
 * can sit at the pill's own height (h-7) instead of the primitive's h-9 - that is
 * what keeps the pill the same height whether the search is open or shut. The
 * results `CommandList` is positioned absolutely so the pill's rounding never
 * clips it.
 *
 * Filtering is **ours**, not cmdk's (`shouldFilter={false}`). The built-in
 * filter would work, but doing it in `searchEntries` makes the matching rules
 * testable - and the first version of this component shipped a bug that only a
 * test would have caught: it capped the item list *before* filtering, so any
 * column past the 40th in catalog order was unreachable no matter what you
 * typed. cmdk still owns keyboard navigation and the combobox roles.
 */

/** Results stagger in; capped so a long list doesn't ripple. */
const STAGGER_MS = 18;
const MAX_STAGGERED = 8;

export function SearchBar({
  graph,
  onPick,
}: {
  graph: SchemaGraph;
  onPick: (entry: SearchEntry) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");

  const index = useMemo(() => buildIndex(graph), [graph]);
  const results = useMemo(() => searchEntries(index, query), [index, query]);

  const collapse = () => {
    setExpanded(false);
    setQuery("");
  };

  /** Picking a result closes the bar. Leaving it open would cover the very
   *  diagram the user just asked to be taken to. */
  const pick = (entry: SearchEntry) => {
    collapse();
    onPick(entry);
  };

  if (!expanded) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setExpanded(true)}
        aria-label="Find a table or column"
        data-testid="erd-search-toggle"
      >
        <Search />
      </Button>
    );
  }

  const tables = results.filter((entry) => entry.kind === "table");
  const columns = results.filter((entry) => entry.kind === "column");

  return (
    <Command
      shouldFilter={false}
      loop
      // Transparent and overflow-visible: the pill supplies the surface, and the
      // floating results must not be clipped by the search region's own box.
      className={cn(
        "relative !w-[19rem] !overflow-visible !bg-transparent",
        !reducedMotion && "animate-in fade-in slide-in-from-left-2 duration-200",
      )}
    >
      <div className="flex h-7 items-center gap-1.5 pr-1 pl-1.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <CommandK.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Find a table or column…"
          // A click on a result blurs the input first, so collapsing is deferred a
          // frame or the row unmounts before its handler runs.
          onBlur={() => window.setTimeout(collapse, 150)}
          onKeyDown={(event) => {
            // Escape only. Do NOT stopPropagation on anything else: cmdk's
            // keyboard handling lives on the Command root, so stopping the event
            // at the input silently disables arrow navigation and Enter - the bar
            // looked fine and simply could not be driven from the keyboard.
            // React Flow needs no protection here; it already ignores key events
            // originating from an input.
            if (event.key === "Escape") collapse();
          }}
          className="h-7 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
          aria-label="Find a table or column"
          data-testid="erd-search"
        />
      </div>

      {query.trim().length > 0 && (
        <CommandList
          className={cn(
            // Floats below the whole pill, aligned to the field, on its own
            // surface so it reads as a dropdown rather than part of the toolbar.
            "absolute top-[calc(100%+0.625rem)] left-0 w-[22rem] rounded-lg border bg-popover shadow-md ring-1 ring-foreground/10",
            !reducedMotion && "animate-in fade-in slide-in-from-top-1 duration-150",
          )}
        >
          {results.length === 0 && <CommandEmpty>Nothing matches that.</CommandEmpty>}

          {tables.length > 0 && (
            <Group heading="Tables" entries={tables} onPick={pick} reducedMotion={reducedMotion}>
              {(entry) => (
                <>
                  <Table2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate font-mono text-[12px]">{entry.entityName}</span>
                </>
              )}
            </Group>
          )}

          {columns.length > 0 && (
            <Group heading="Columns" entries={columns} onPick={pick} reducedMotion={reducedMotion}>
              {(entry) => (
                <>
                  <span className="truncate font-mono text-[12px]">
                    <span className="text-muted-foreground">{entry.entityName}.</span>
                    {entry.columnName}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                    {entry.typeLabel}
                  </span>
                </>
              )}
            </Group>
          )}
        </CommandList>
      )}
    </Command>
  );
}

function Group({
  heading,
  entries,
  onPick,
  reducedMotion,
  children,
}: {
  heading: string;
  entries: SearchEntry[];
  onPick: (entry: SearchEntry) => void;
  reducedMotion: boolean;
  children: (entry: SearchEntry) => React.ReactNode;
}) {
  return (
    <CommandGroup heading={heading}>
      {entries.map((entry, i) => (
        <CommandItem
          key={entry.key}
          // Unique per row. cmdk dedupes by value, and two columns of the same
          // name in different tables must stay distinct.
          value={entry.key}
          onSelect={() => onPick(entry)}
          className={cn(!reducedMotion && "animate-in fade-in duration-150")}
          style={
            reducedMotion
              ? undefined
              : { animationDelay: `${Math.min(i, MAX_STAGGERED) * STAGGER_MS}ms` }
          }
        >
          {children(entry)}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
