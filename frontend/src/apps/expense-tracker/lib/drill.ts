/**
 * Where a visual currently sits in its hierarchy, and how it got there.
 *
 * Power BI offers two different ways down, and they are not the same thing:
 * *drilling into* a mark descends a level **and filters to that mark**, while
 * *going to the next level* descends **without filtering**, showing every group
 * at the deeper level. The title says which happened - "Transactions by Year and
 * Month" is a drill into a year; "Transactions by Month" is the next level.
 *
 * Modelling the descent as a stack of steps makes drilling up a pop, and keeps
 * the two kinds distinguishable however they are interleaved. Every visual on
 * the Breakdown page shares this: the matrix, the waterfall and the pie.
 */

import { DIMENSION_TITLES, type Criterion, type Dimension } from "./breakdown";

export type DrillStep = { kind: "into"; criterion: Criterion } | { kind: "skip" };

export interface DrillState {
  steps: readonly DrillStep[];
}

export const INITIAL_DRILL: DrillState = { steps: [] };

/** How deep we are: an index into the hierarchy. */
export function drillLevel(state: DrillState): number {
  return state.steps.length;
}

/** The dimension a visual is grouping by right now. */
export function currentDimension(
  state: DrillState,
  hierarchy: readonly Dimension[],
): Dimension | undefined {
  return hierarchy[drillLevel(state)];
}

/** The criteria to filter by - only the steps that drilled *into* a mark filter. */
export function drillFilter(state: DrillState): Criterion[] {
  return state.steps.flatMap((step) => (step.kind === "into" ? [step.criterion] : []));
}

export function canDrillUp(state: DrillState): boolean {
  return state.steps.length > 0;
}

export function canDrillDown(state: DrillState, hierarchy: readonly Dimension[]): boolean {
  return drillLevel(state) < hierarchy.length - 1;
}

/** Descend into one mark, filtering to it. */
export function drillInto(
  state: DrillState,
  hierarchy: readonly Dimension[],
  key: string,
): DrillState {
  const dim = currentDimension(state, hierarchy);
  if (dim === undefined || !canDrillDown(state, hierarchy)) return state;
  return { steps: [...state.steps, { kind: "into", criterion: { dim, key } }] };
}

/** Descend a level showing every group, filtering nothing. */
export function skipToNextLevel(state: DrillState, hierarchy: readonly Dimension[]): DrillState {
  if (!canDrillDown(state, hierarchy)) return state;
  return { steps: [...state.steps, { kind: "skip" }] };
}

export function drillUp(state: DrillState): DrillState {
  if (!canDrillUp(state)) return state;
  return { steps: state.steps.slice(0, -1) };
}

/**
 * The visual's title, Power BI style: every level we drilled *into*, then the
 * level we are on. Skipped levels leave no trace, because nothing was filtered
 * by them - which is exactly what distinguishes "by Month" from "by Year and
 * Month".
 */
export function drillTitle(
  subject: string,
  state: DrillState,
  hierarchy: readonly Dimension[],
): string {
  const named = state.steps.flatMap((step, index) => {
    const dim = hierarchy[index];
    return step.kind === "into" && dim !== undefined ? [DIMENSION_TITLES[dim]] : [];
  });
  const current = currentDimension(state, hierarchy);
  if (current !== undefined) named.push(DIMENSION_TITLES[current]);
  if (named.length === 0) return subject;

  const last = named.at(-1) as string;
  const listed = named.length === 1 ? last : `${named.slice(0, -1).join(", ")} and ${last}`;
  return `${subject} by ${listed}`;
}
