"use client";

import { ErrorFallback } from "@/components/ErrorFallback";

export default function AuthError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorFallback error={error} retry={unstable_retry} source="auth-error-boundary" />;
}
