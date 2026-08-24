"use client";

import dynamic from "next/dynamic";

import { ChartSkeleton } from "@/components/common/skeletons";

/**
 * CategoryPieChart, loaded on demand - same bargain as the other primitives:
 * Recharts is ~100KB gzipped and most pages plot nothing.
 */
export const LazyCategoryPieChart = dynamic(
  () => import("./CategoryPieChart").then((m) => m.CategoryPieChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
