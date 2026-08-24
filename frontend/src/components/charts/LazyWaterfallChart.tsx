"use client";

import dynamic from "next/dynamic";

import { ChartSkeleton } from "@/components/common/skeletons";

/**
 * WaterfallChart, loaded on demand - same bargain as LazyTimeSeriesChart:
 * Recharts is ~100KB gzipped and most pages plot nothing, so it arrives while
 * the data is still in flight, behind a skeleton the size of the chart.
 */
export const LazyWaterfallChart = dynamic(
  () => import("./WaterfallChart").then((m) => m.WaterfallChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
