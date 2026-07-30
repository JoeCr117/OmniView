"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The two ends of a client fetch, for every app.
 *
 * Prefer a *shaped* skeleton from ./skeletons over the generic <Loading/>: a
 * block the size of the thing that's coming doesn't shift the layout when it
 * arrives, and it tells the user what to expect. <Loading/> is the fallback for
 * surfaces with no predictable shape.
 */
export function Loading({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center gap-2 p-6 text-sm text-muted-foreground", className)}
    >
      <RefreshCw className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6",
        className,
      )}
    >
      <p className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">Failed to load:</span> {message}
        </span>
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw />
        Retry
      </Button>
    </div>
  );
}
