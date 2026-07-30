"use client";

import { useSyncExternalStore } from "react";

/** The element never changes for the life of the page, so there is nothing to
 *  subscribe to - but useSyncExternalStore is still the right shape: it reads a
 *  value out of the DOM without mirroring it into state from an effect. */
const subscribe = () => () => {};

/** Referentially stable: getElementById returns the same node every call, which
 *  is what keeps useSyncExternalStore from looping. */
const getSnapshot = () => document.getElementById("app-viewport") ?? document.body;

/** No DOM during the static export; Radix reads `undefined` as "use the default
 *  container", which is correct until the real one is known. */
const getServerSnapshot = () => undefined;

/**
 * Where a portalled overlay must render so it survives fullscreen.
 *
 * Radix portals to `document.body` by default. `#app-viewport` is this shell's
 * fullscreen target (see `app/(shell)/layout.tsx`), and when an element is
 * fullscreened the browser paints *only that element's subtree* - so a popover,
 * sheet or dropdown attached to `body` is completely invisible while fullscreen
 * is active, and perfectly fine the rest of the time. That is a nasty failure to
 * find, because every test and every windowed click passes.
 */
export function useOverlayContainer(): HTMLElement | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
