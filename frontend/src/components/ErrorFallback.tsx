"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { reportClientError } from "@/lib/log";

/**
 * Shared UI + logging for the route-segment error boundaries
 * ((shell)/error.tsx and (auth)/error.tsx). Logs locally and ships the
 * error to /api/logs/frontend once per error instance.
 */
export function ErrorFallback({
  error,
  retry,
  source,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  source: string;
}) {
  useEffect(() => {
    reportClientError(source, error);
  }, [error, source]);

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-md" role="alert">
        <CardHeader>
          <TriangleAlert className="mb-2 size-8 text-destructive" aria-hidden />
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            The error has been logged.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm break-words text-muted-foreground">{error.message}</p>
          <Button onClick={retry}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
