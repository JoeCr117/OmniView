"use client";

import dynamic from "next/dynamic";

import { ChartSkeleton } from "@/components/common/skeletons";

/**
 * TimeSeriesChart, loaded on demand.
 *
 * Recharts is ~100KB gzipped and only two pages plot anything, so paying for it
 * in the initial bundle would slow down every page that doesn't. Split out, it
 * arrives while the data is still in flight - behind a skeleton the size of the
 * chart, so nothing shifts when it lands.
 */
export const LazyTimeSeriesChart = dynamic(
  () => import("./TimeSeriesChart").then((m) => m.TimeSeriesChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
