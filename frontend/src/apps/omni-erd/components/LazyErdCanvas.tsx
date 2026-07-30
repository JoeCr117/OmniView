"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * ErdCanvas, loaded on demand.
 *
 * React Flow plus dagre is ~90KB gzipped and exactly one page in OmniView draws
 * a diagram, so it has no business in the initial bundle - same reasoning as
 * LazyTimeSeriesChart. `ssr: false` is required rather than merely preferred:
 * React Flow measures the DOM on mount, and this is a static export, so there
 * is no server render worth producing.
 */
export const LazyErdCanvas = dynamic(
  () => import("./ErdCanvas").then((m) => m.ErdCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center p-6">
        <Skeleton className="h-full w-full rounded-md" />
      </div>
    ),
  },
);
