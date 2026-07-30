/**
 * Frontend logging: loglevel for leveled console output (bare console has no
 * level control), plus a shipper that POSTs errors to the backend's
 * /api/logs/frontend so browser-side failures show up in `docker logs`.
 *
 * The shipper is deliberately inert: raw fetch (not apiFetch - a 401 on a
 * log POST must not dispatch the unauthorized event and navigate the user),
 * every failure swallowed, one shipment in flight at a time plus a hard
 * per-pageload cap, so a failing log pipeline can never loop or cascade.
 */

import log from "loglevel";

import { readCookie } from "@/lib/http";

const DEFAULT_LEVEL: log.LogLevelDesc =
  process.env.NODE_ENV === "production" ? "warn" : "debug";

try {
  // persist=false: never write the level to localStorage (loglevel's default
  // persistence would let a stale stored level shadow the env config).
  log.setLevel(
    (process.env.NEXT_PUBLIC_LOG_LEVEL as log.LogLevelDesc) ?? DEFAULT_LEVEL,
    false,
  );
} catch {
  log.setLevel(DEFAULT_LEVEL, false);
}

export default log;

export type ShipLevel = "debug" | "info" | "warn" | "error";

export interface ShipEntry {
  level: ShipLevel;
  message: string;
  source?: string;
  url?: string;
  stack?: string;
}

// Server-side Schema caps (core/logs_api.py) - trim client-side so a long
// stack degrades to truncation instead of a 422.
const CAPS = { message: 4000, source: 200, url: 2000, stack: 8000 } as const;

const MAX_SHIPMENTS_PER_PAGELOAD = 20;
let inFlight = false;
let shipped = 0;

/** Test hook: reset the re-entrancy/budget state between cases. */
export function resetShipperForTests(): void {
  inFlight = false;
  shipped = 0;
}

export async function shipLog(entry: ShipEntry): Promise<void> {
  if (typeof window === "undefined") return;
  if (inFlight || shipped >= MAX_SHIPMENTS_PER_PAGELOAD) return;
  inFlight = true;
  shipped += 1;
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
    const token = readCookie("csrftoken");
    await fetch(`${base}/api/logs/frontend`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-CSRFToken": token } : {}),
      },
      body: JSON.stringify({
        level: entry.level,
        message: entry.message.slice(0, CAPS.message),
        source: (entry.source ?? "").slice(0, CAPS.source),
        url: (entry.url ?? window.location.pathname).slice(0, CAPS.url),
        stack: (entry.stack ?? "").slice(0, CAPS.stack),
      }),
    });
  } catch {
    // Swallow everything: the log pipeline must never throw (a rejection
    // here would re-enter the window unhandledrejection listener).
  } finally {
    inFlight = false;
  }
}

/** Log locally AND ship to the backend - the one call sites should use. */
export function reportClientError(source: string, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  log.error(`[${source}]`, err);
  void shipLog({
    level: "error",
    message: err.message || String(error),
    source,
    stack: err.stack ?? "",
  });
}
