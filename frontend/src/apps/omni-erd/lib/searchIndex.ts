import type { SchemaGraph } from "./types";

/**
 * Everything in the current schema that can be jumped to by name.
 *
 * One flat list of tables and columns, built once per graph. `datavault` is 22
 * tables and 206 columns, so 228 entries - small enough that filtering it on
 * every keystroke is free, and there is no need for an index structure beyond
 * an array.
 *
 * Scoped to the loaded namespace on purpose: the graph is fetched per namespace,
 * so searching across schemas would mean fetching every one of them up front.
 */

export interface SearchEntry {
  /** Stable and unique - used as the React key and as cmdk's item value. */
  key: string;
  kind: "table" | "column";
  entityId: string;
  entityName: string;
  /** The column, for a column entry. */
  columnName?: string;
  /** Normalised type, shown as a hint on column rows. */
  typeLabel?: string;
  /**
   * What cmdk matches against. Column entries include their table name so
   * "dimdate datesk" finds the right one of the fifteen `datesk` columns, and
   * so typing a table name surfaces its columns too.
   */
  searchText: string;
}

export function buildIndex(graph: SchemaGraph): SearchEntry[] {
  const tables: SearchEntry[] = [];
  const columns: SearchEntry[] = [];

  for (const entity of graph.entities) {
    tables.push({
      key: `t:${entity.id}`,
      kind: "table",
      entityId: entity.id,
      entityName: entity.name,
      searchText: entity.name,
    });

    for (const column of entity.columns) {
      columns.push({
        key: `c:${entity.id}.${column.name}`,
        kind: "column",
        entityId: entity.id,
        entityName: entity.name,
        columnName: column.name,
        typeLabel: column.type.base,
        searchText: `${column.name} ${entity.name}`,
      });
    }
  }

  // Tables first: a bare table name should not be buried under its own columns.
  return [...tables, ...columns];
}

/** Beyond this the list stops being scannable. Applied *after* matching - the
 *  first version capped the input instead, which meant any column past the 40th
 *  in catalog order could never be found at all. */
export const MAX_RESULTS = 50;

/**
 * Rank one entry against one query token. Higher is better; 0 means no match.
 *
 * Matching is done here rather than left to cmdk's built-in filter so that it
 * is predictable and, more importantly, testable - "typing `bank` finds
 * `budgets_budgetmapdocument.bank`" is a claim worth pinning down.
 */
function scoreToken(entry: SearchEntry, token: string): number {
  const name = (entry.columnName ?? entry.entityName).toLowerCase();
  const haystack = entry.searchText.toLowerCase();

  if (name === token) return 100;
  if (name.startsWith(token)) return 80;
  // A word boundary inside a snake_case name: `label` should find `app_label`.
  if (name.includes(`_${token}`)) return 60;
  if (name.includes(token)) return 40;
  // Falls back to the whole haystack, which folds in the table name - so
  // "content_type app_label" narrows to the right column.
  if (haystack.includes(token)) return 20;
  return 0;
}

/**
 * Filter and rank the index.
 *
 * Every whitespace-separated token must match something, so "dimdate datesk"
 * narrows rather than widens. Tables outrank columns at equal score, which keeps
 * a table from being buried under its own column list.
 */
export function searchEntries(
  index: SearchEntry[],
  query: string,
  limit: number = MAX_RESULTS,
): SearchEntry[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const scored: Array<{ entry: SearchEntry; score: number }> = [];
  for (const entry of index) {
    let total = 0;
    for (const token of tokens) {
      const score = scoreToken(entry, token);
      if (score === 0) {
        total = 0;
        break;
      }
      total += score;
    }
    if (total > 0) scored.push({ entry, score: total });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.entry.kind !== b.entry.kind) return a.entry.kind === "table" ? -1 : 1;
    return a.entry.key.localeCompare(b.entry.key);
  });

  return scored.slice(0, limit).map((s) => s.entry);
}
