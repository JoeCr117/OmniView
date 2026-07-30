"use client";

import { ErrorFallback } from "@/components/ErrorFallback";

/**
 * Boundary for everything rendered inside the shell viewport. Next 16
 * renamed the recovery prop: `unstable_retry` re-fetches and re-renders the
 * segment (the old `reset` only clears state).
 */
export default function ShellError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorFallback error={error} retry={unstable_retry} source="shell-error-boundary" />;
}
