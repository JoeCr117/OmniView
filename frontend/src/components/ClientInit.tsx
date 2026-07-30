"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/log";

/**
 * Global browser-error capture, mounted once in the root layout. Anything
 * that escapes React (event handlers, async code, third-party scripts)
 * surfaces as window `error`/`unhandledrejection` events; React render
 * errors are caught by the error.tsx boundaries instead.
 */
export function ClientInit() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportClientError("window.onerror", event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportClientError("window.unhandledrejection", event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
