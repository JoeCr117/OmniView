"use client";

import { useEffect, useState } from "react";

/**
 * Returns `value` delayed by `delayMs`, resetting the timer on every change.
 *
 * The Users & Access search fired one API request per keystroke - typing
 * "joseph" was six paginated queries, five of them thrown away. Feeding the
 * debounced value into the query key collapses a burst of typing into a single
 * request once the user pauses. Kept generic (not search-specific) so any
 * rapidly-changing value that drives a fetch can go through it.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
