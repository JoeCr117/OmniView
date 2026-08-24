/**
 * Everything the Breakdown page is currently showing, as one value.
 *
 * The page used to keep three of these in `useState` and let each visual own the
 * rest privately. That is what broke Restart: the button's enabled test could
 * only see what the page held, so drilling a visual left it disabled, and
 * pressing it left the drill in place. Eight pieces of state were invisible to
 * the control whose whole job was to clear them.
 *
 * So the view is one object with one default. `isDefaultView` and Restart are
 * both derived from `INITIAL_VIEW`, which means a piece of state added later
 * cannot be half-wired: it either goes in this type - and both the predicate and
 * the reset pick it up for free - or it does not exist. That is the property
 * worth having, more than the tidiness.
 *
 * Sort order is the one thing deliberately left out. Tabulator owns it
 * internally and the source report's bookmark did not capture it either.
 */

import { INITIAL_DRILL, type DrillState } from "./drill";
import { NO_CROSS_FILTER, isFiltered, type CrossFilter } from "./crossFilter";
import type { Axis } from "./breakdown";

export interface MatrixView {
  drill: DrillState;
  drillMode: boolean;
  expandAll: boolean;
}

export interface WaterfallView {
  axis: Axis;
  /** Kept per axis, so switching to Category and back does not lose the year. */
  drills: Record<Axis, DrillState>;
  drillMode: boolean;
}

export interface PieView {
  drill: DrillState;
  drillMode: boolean;
}

export interface BreakdownView {
  /** Empty = no filter = every year/month, which is Power BI's filter context. */
  years: ReadonlySet<string>;
  months: ReadonlySet<number>;
  filter: CrossFilter;
  matrix: MatrixView;
  waterfall: WaterfallView;
  pie: PieView;
}

/**
 * The report as it opens: no slicer, no cross-filter, every visual at the top of
 * its hierarchy. The legacy Restart control was a Power BI bookmark of exactly
 * this state.
 */
export const INITIAL_VIEW: BreakdownView = {
  years: new Set(),
  months: new Set(),
  filter: NO_CROSS_FILTER,
  matrix: { drill: INITIAL_DRILL, drillMode: false, expandAll: false },
  waterfall: {
    axis: "date",
    drills: { date: INITIAL_DRILL, category: INITIAL_DRILL },
    drillMode: false,
  },
  pie: { drill: INITIAL_DRILL, drillMode: false },
};

function isTopLevel(drill: DrillState): boolean {
  return drill.steps.length === 0;
}

/**
 * True when the page is showing exactly `INITIAL_VIEW`, so Restart has nothing
 * to do.
 *
 * Written out field by field rather than deep-equalling against `INITIAL_VIEW`,
 * because a structural compare would silently start returning false the moment
 * some future field held a value that is equal but not identical - and a Restart
 * button that is always enabled is a smaller bug than one that is never enabled,
 * but it is still a bug. Each line here says what "default" means for its field.
 */
export function isDefaultView(view: BreakdownView): boolean {
  return (
    view.years.size === 0 &&
    view.months.size === 0 &&
    !isFiltered(view.filter) &&
    isTopLevel(view.matrix.drill) &&
    !view.matrix.drillMode &&
    !view.matrix.expandAll &&
    view.waterfall.axis === INITIAL_VIEW.waterfall.axis &&
    isTopLevel(view.waterfall.drills.date) &&
    isTopLevel(view.waterfall.drills.category) &&
    !view.waterfall.drillMode &&
    isTopLevel(view.pie.drill) &&
    !view.pie.drillMode
  );
}
