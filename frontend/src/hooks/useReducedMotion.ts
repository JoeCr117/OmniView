"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;

/** No `window` during the static export, and guessing "reduced" for everyone
 *  would be the wrong default for the majority. */
const getServerSnapshot = () => false;

/**
 * Whether the user has asked the OS to keep animation to a minimum.
 *
 * Read as a hook rather than left to CSS because several of Omni-ERD's
 * transitions are driven from JavaScript - React Flow's `setCenter` and
 * `fitView` take a `duration` argument, and the collapse tween drives a
 * requestAnimationFrame loop - and a media query in a stylesheet cannot reach
 * any of them.
 *
 * `useSyncExternalStore` rather than useState + useEffect: a media query is
 * exactly the external store this hook exists for, and setting state from an
 * effect to mirror one causes the cascading render the React compiler warns
 * about.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
