/**
 * Power BI cross-filtering: click a mark in one visual, and the others reduce to
 * it. Ctrl-click a second visual, and they reduce to both.
 *
 * Three rules make it behave the way a reader expects:
 *
 * **A visual never filters itself.** Clicking Food in the pie must leave the pie
 * showing every category — otherwise the chart collapses to a single 100% slice
 * and there is no way back. The source keeps its full data and dims the marks
 * outside the selection instead; every *other* visual filters.
 *
 * **Several values of one dimension are OR, different dimensions are AND.**
 * Selecting Food and Rent means "either"; selecting Food and 2025 means "both".
 * Anything else makes a multi-select return nothing, which reads as a bug.
 *
 * **Selections from different visuals compose.** Each visual owns at most one
 * selection and they intersect, so "CreditCard from the matrix" and "2024 from
 * the waterfall" narrow the pie to their overlap. This is what the source
 * report does, and it is why the state is a map keyed by visual rather than a
 * single `{source, criteria}` pair: with one source, the second click could only
 * ever discard the first.
 *
 * Composing still cannot leave a visual unable to show the whole, because the
 * first rule is applied per target — a visual is exempt from its OWN entry and
 * from no other.
 */

import type { BreakdownRow } from "./api";
import { dimensionKey, type Criterion, type Dimension } from "./breakdown";

export type VisualId = "matrix" | "waterfall" | "pie";

/**
 * Every visual's current selection, keyed by the visual that made it.
 *
 * A visual with no entry (or an empty one) is not filtering anything. The empty
 * object is therefore "no cross-filter at all", which is what `INITIAL_VIEW`
 * resets to.
 */
export type CrossFilter = Partial<Record<VisualId, readonly Criterion[]>>;

export const NO_CROSS_FILTER: CrossFilter = {};

export function matchesSelection(
  row: BreakdownRow,
  criteria: readonly Criterion[],
): boolean {
  const byDimension = new Map<Dimension, string[]>();
  for (const criterion of criteria) {
    const keys = byDimension.get(criterion.dim);
    if (keys) keys.push(criterion.key);
    else byDimension.set(criterion.dim, [criterion.key]);
  }

  for (const [dim, keys] of byDimension) {
    if (!keys.includes(dimensionKey(row, dim))) return false;
  }
  return true;
}

/** True when no visual has a selection. */
export function isFiltered(filter: CrossFilter): boolean {
  return sources(filter).length > 0;
}

/** The visuals currently holding a non-empty selection, in a stable order. */
function sources(filter: CrossFilter): VisualId[] {
  const order: VisualId[] = ["matrix", "waterfall", "pie"];
  return order.filter((visual) => (filter[visual]?.length ?? 0) > 0);
}

/**
 * The rows a given visual should draw: everything, narrowed by every OTHER
 * visual's selection.
 *
 * The target's own criteria are skipped rather than applied — that is the
 * "a visual never filters itself" rule, and applying it per target is what lets
 * selections compose without any visual losing its context.
 */
export function rowsFor(
  rows: readonly BreakdownRow[],
  filter: CrossFilter,
  target: VisualId,
): readonly BreakdownRow[] {
  const applied = sources(filter).filter((visual) => visual !== target);
  if (applied.length === 0) return rows;

  return rows.filter((row) =>
    applied.every((visual) => matchesSelection(row, filter[visual] ?? [])),
  );
}

/**
 * The keys a visual should keep bright.
 *
 * Only a visual's own selection dims it: everything left in a visual filtered by
 * someone else is, by definition, inside that selection. An empty result means
 * "dim nothing".
 */
export function highlightedKeys(filter: CrossFilter, target: VisualId): string[] {
  return (filter[target] ?? []).map((criterion) => criterion.key);
}

function sameCriterion(a: Criterion, b: Criterion): boolean {
  return a.dim === b.dim && a.key === b.key;
}

/**
 * Apply a click.
 *
 * A plain click is a fresh start: it selects one mark and drops every other
 * visual's selection, so a reader who has lost track can always get back to one
 * filter with one click. Ctrl/shift **extends** — it toggles the mark within its
 * own visual and leaves the other visuals standing, which is how a compound
 * selection is built and how a value is removed from one.
 *
 * A `null` criterion is how a visual reports a click on empty space, and clears
 * everything.
 */
export function applyClick(
  current: CrossFilter,
  source: VisualId,
  criterion: Criterion | null,
  extend = false,
): CrossFilter {
  if (criterion === null) return NO_CROSS_FILTER;

  if (!extend) {
    const only =
      current[source]?.length === 1 && sameCriterion(current[source][0], criterion);
    return only ? NO_CROSS_FILTER : { [source]: [criterion] };
  }

  const existing = current[source] ?? [];
  const without = existing.filter((other) => !sameCriterion(other, criterion));
  const criteria = without.length === existing.length ? [...existing, criterion] : without;

  const next: CrossFilter = { ...current, [source]: criteria };
  if (criteria.length === 0) delete next[source];
  return next;
}

/** What the selection chip says, e.g. "CreditCard, 2024". */
export function describeSelection(filter: CrossFilter): string {
  return sources(filter)
    .flatMap((visual) => (filter[visual] ?? []).map((criterion) => criterion.key))
    .join(", ");
}
