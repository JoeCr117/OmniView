/**
 * Power BI cross-filtering: click a mark in one visual, and the others reduce to
 * it.
 *
 * Two rules make it behave the way a reader expects:
 *
 * **A visual never filters itself.** Clicking Food in the pie must leave the pie
 * showing every category — otherwise the chart collapses to a single 100% slice
 * and there is no way back. The source keeps its full data and dims the marks
 * outside the selection instead; every *other* visual filters.
 *
 * **Several values of one dimension are OR, different dimensions are AND.**
 * Selecting Food and Rent means "either"; selecting Food and 2025 means "both".
 * Anything else makes a multi-select return nothing, which reads as a bug.
 */

import type { BreakdownRow } from "./api";
import { dimensionKey, type Criterion, type Dimension } from "./breakdown";

export type VisualId = "matrix" | "waterfall" | "pie";

export interface Selection {
  /** The visual the click came from; it is the one that does not filter. */
  source: VisualId;
  criteria: readonly Criterion[];
}

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

/** The rows a given visual should draw. */
export function rowsFor(
  rows: readonly BreakdownRow[],
  selection: Selection | null,
  target: VisualId,
): readonly BreakdownRow[] {
  if (selection === null || selection.source === target) return rows;
  return rows.filter((row) => matchesSelection(row, selection.criteria));
}

/**
 * The keys a visual should keep bright.
 *
 * Only the source dims anything: everything left in a filtered visual is, by
 * definition, in the selection. An empty result means "dim nothing".
 */
export function highlightedKeys(selection: Selection | null, target: VisualId): string[] {
  if (selection === null || selection.source !== target) return [];
  return selection.criteria.map((criterion) => criterion.key);
}

function sameCriterion(a: Criterion, b: Criterion): boolean {
  return a.dim === b.dim && a.key === b.key;
}

/**
 * Apply a click.
 *
 * A plain click selects one mark, and clicking the selected mark again clears —
 * so a reader can always get back without hunting for a reset. Ctrl/shift
 * extends, and extending is what removes a value from a multi-selection.
 * Clicking into a different visual starts a new selection rather than mixing two
 * sources, which would leave no visual able to show the whole.
 */
export function applyClick(
  current: Selection | null,
  source: VisualId,
  criterion: Criterion | null,
  extend = false,
): Selection | null {
  if (criterion === null) return null;

  if (current === null || current.source !== source) {
    return { source, criteria: [criterion] };
  }

  if (!extend) {
    const only = current.criteria.length === 1 && sameCriterion(current.criteria[0], criterion);
    return only ? null : { source, criteria: [criterion] };
  }

  const without = current.criteria.filter((existing) => !sameCriterion(existing, criterion));
  if (without.length !== current.criteria.length) {
    return without.length === 0 ? null : { source, criteria: without };
  }
  return { source, criteria: [...current.criteria, criterion] };
}

/** What the selection chip says, e.g. "Food, Rent". */
export function describeSelection(selection: Selection | null): string {
  if (selection === null) return "";
  return selection.criteria.map((criterion) => criterion.key).join(", ");
}
