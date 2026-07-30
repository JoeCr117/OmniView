"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

/**
 * A tiny stale-while-revalidate cache over apiFetch, so a page never blanks
 * once it has data.
 *
 * The problem it solves: every data page used to be `useState<T | null>(null)`
 * + a `load()` that did `setData(null)` before fetching. That means *every*
 * fetch - including a refetch triggered by paging, a filter change, or just
 * revisiting a tab - threw the current content away and flashed "Loading…".
 * Switching apps then refetched from scratch because the component had
 * unmounted (see the keep-alive note in HANDOFF).
 *
 * useResource keeps the last value in a module-level cache keyed by a string,
 * so:
 *   - a first visit shows a skeleton, but a *revisit* paints the cached value
 *     instantly and refreshes underneath (`isValidating`) instead of blanking;
 *   - two components asking for the same key (Check Book and Daily Trends both
 *     want the full daily-metrics payload) share one in-flight request and one
 *     cached result - the 5,000-row fetch happens once;
 *   - a refetch reuses the visible data as its background; callers show a thin
 *     progress bar (`isValidating`) rather than tearing the page down.
 *
 * It is deliberately ~100 lines and has no dependency. It is NOT a general
 * data layer (no pagination-aware cache, no revalidate-on-focus): those weren't
 * needed, and every line here has a caller.
 */

interface CacheEntry<T> {
  data?: T;
  error?: unknown;
  /** Set while a fetch is in flight - the dedupe/`isValidating` signal. */
  promise?: Promise<void>;
  /** Epoch ms of the last settled fetch; 0 means "never fetched". */
  updatedAt: number;
  /** Subscribed hooks to re-render when this entry changes. */
  listeners: Set<() => void>;
  /** The most recent subscriber's fetcher, so invalidateResource can refetch
   *  without a fetcher of its own (mutations don't have one). */
  fetcher?: () => Promise<T>;
}

// One cache for the whole app. Module scope, so it survives component unmounts
// (that is the entire point - a backgrounded tab's data is still here when you
// come back) but resets on a full reload, which is the correct lifetime for a
// session-scoped read cache.
const cache = new Map<string, CacheEntry<unknown>>();

function entryFor<T>(key: string): CacheEntry<T> {
  let entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    entry = { updatedAt: 0, listeners: new Set() };
    cache.set(key, entry as CacheEntry<unknown>);
  }
  return entry;
}

function notify(entry: CacheEntry<unknown>) {
  entry.listeners.forEach((listener) => listener());
}

/**
 * Fetch for `key`, coalescing with any in-flight fetch for the same key. The
 * fetcher's result (or error) is stored on the entry; subscribers re-render on
 * both the start (so `isValidating` flips true) and the settle.
 */
function revalidate<T>(key: string, fetcher: () => Promise<T>): Promise<void> {
  const entry = entryFor<T>(key);
  if (entry.promise) return entry.promise;

  const promise = fetcher()
    .then((data) => {
      entry.data = data;
      entry.error = undefined;
    })
    .catch((error: unknown) => {
      // Keep the last good `data` on error, so a failed *refresh* leaves the
      // page as it was rather than replacing it with an error panel. First-load
      // errors have no data to keep, and the caller renders `error` then.
      entry.error = error;
    })
    .finally(() => {
      entry.updatedAt = Date.now();
      entry.promise = undefined;
      notify(entry);
    });

  entry.promise = promise;
  notify(entry);
  return promise;
}

/**
 * Drop a key's cached value and refetch it if anyone is watching. For use after
 * a mutation invalidates a read (e.g. an upload changes the file list). If the
 * key has a live subscriber we revalidate immediately using its fetcher, so the
 * data refreshes in place; otherwise we just clear it and the next mount fetches.
 */
export function invalidateResource(key: string) {
  const entry = cache.get(key);
  if (!entry) return;
  entry.updatedAt = 0;
  entry.data = undefined;
  entry.error = undefined;
  if (entry.fetcher && entry.listeners.size > 0) {
    revalidate(key, entry.fetcher);
  } else {
    notify(entry);
  }
}

/** Test-only: forget everything so cases don't leak state into each other. */
export function __clearResourceCache() {
  cache.clear();
}

export type ResourceStatus = "loading" | "success" | "error";

export interface Resource<T> {
  data: T | undefined;
  error: unknown;
  status: ResourceStatus;
  /** A background refresh is in flight over already-shown data - drive a bar. */
  isValidating: boolean;
  refetch: () => void;
}

export interface ResourceOptions {
  /** Skip a background refetch if the cache settled within this window (ms). */
  dedupeMs?: number;
}

/**
 * Subscribe to the cached resource at `key`, fetching via `fetcher` when the
 * cache is cold or stale. Pass `key = null` to disable (e.g. while a required
 * parameter is still null) - the hook then reports `loading` and fetches
 * nothing. `fetcher` may close over fresh values every render; only `key`
 * identifies the cache slot.
 */
export function useResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  { dedupeMs = 2000 }: ResourceOptions = {},
): Resource<T> {
  // Always call the latest fetcher, but never re-subscribe because its identity
  // changed - only `key` should drive the subscribe effect. The ref is updated
  // in its own effect (not during render) so it's fresh by the time any later
  // effect or handler reads it, without tripping the refs-in-render rule.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const subscribeAndMaybeFetch = useCallback(() => {
    if (key === null) return undefined;
    const entry = entryFor<T>(key);
    entry.listeners.add(forceRender);
    entry.fetcher = () => fetcherRef.current();
    const cold = entry.updatedAt === 0;
    const stale = Date.now() - entry.updatedAt > dedupeMs;
    if (!entry.promise && (cold || stale)) {
      revalidate(key, () => fetcherRef.current());
    }
    return () => {
      entry.listeners.delete(forceRender);
    };
  }, [key, dedupeMs]);

  // subscribeAndMaybeFetch's identity already encodes (key, dedupeMs), so this
  // re-subscribes exactly when either changes, and never otherwise.
  useEffect(subscribeAndMaybeFetch, [subscribeAndMaybeFetch]);

  const entry = key !== null ? entryFor<T>(key) : undefined;
  const data = entry?.data;
  const error = entry?.error;
  const hasData = entry !== undefined && entry.updatedAt !== 0 && error === undefined;
  const status: ResourceStatus = hasData ? "success" : error !== undefined ? "error" : "loading";

  const refetch = useCallback(() => {
    if (key !== null) revalidate(key, () => fetcherRef.current());
  }, [key]);

  return { data, error, status, isValidating: entry?.promise !== undefined, refetch };
}
