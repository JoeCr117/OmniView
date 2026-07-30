/**
 * Ordered multi-selection.
 *
 * Ctrl-click toggles a table in or out. Order is preserved - a new id lands at
 * the end - so the contextual flyout lists tables in the order they were picked,
 * starting from the first Ctrl-click.
 *
 * Pure and array-based (not a Set) precisely so that order is observable and the
 * whole thing is trivially unit-testable without a canvas.
 */
export function toggle(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id];
}
