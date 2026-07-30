"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import { downsample } from "./downsample";

/**
 * The one chart: a labelled, interrogable time series.
 *
 * Every chart in OmniView goes through here, so every chart gets the same
 * things - both axes labelled with their units, a crosshair that tracks the
 * pointer, and a tooltip at the cursor listing the underlying row. The chart it
 * replaced drew gridlines and nothing else: no ticks, no axis labels, no units,
 * and a hardcoded aria-label that announced the Admin Portal's DBU chart as
 * "Total balance over time".
 *
 * Long series are downsampled (see ./downsample) before they reach Recharts.
 */

export interface TimePoint {
  /** The category value: a YYYY-MM-DD date. */
  x: string;
  y: number;
}

export interface TimeSeries {
  /** Stable key; also the tooltip/legend lookup. */
  key: string;
  label: string;
  points: readonly TimePoint[];
  /** Defaults to the --chart-N palette in registration order. */
  color?: string;
}

/** The category axis: dates, formatted as text. */
export interface XAxisSpec {
  /** Axis title, e.g. "Date". */
  label: string;
  /** Tick text. Keep it short - ticks are the one place brevity beats clarity. */
  format?: (value: string) => string;
}

/** The value axis: numbers, which mean nothing without their unit. */
export interface YAxisSpec {
  label: string;
  /** "USD", "DBUs". Appended to the axis title, so the reader never has to guess. */
  unit?: string;
  format?: (value: number) => string;
}

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Points to keep. ~1k is well past the pixel width of any chart we render. */
const MAX_POINTS = 1000;

export function TimeSeriesChart({
  series,
  x,
  y,
  ariaLabel,
  height = 260,
  emptyMessage = "No data for this range.",
  className,
}: {
  series: readonly TimeSeries[];
  x: XAxisSpec;
  y: YAxisSpec;
  /** Required: what this chart is *of*. Screen readers get nothing else. */
  ariaLabel: string;
  height?: number;
  emptyMessage?: string;
  className?: string;
}) {
  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        series.map((s, i) => [
          s.key,
          { label: s.label, color: s.color ?? PALETTE[i % PALETTE.length] },
        ]),
      ),
    [series],
  );

  // Recharts wants one row per x with a column per series, so thin each series
  // first (its own shape decides which points matter), then merge on x.
  const data = useMemo(() => {
    const rows = new Map<string, Record<string, string | number>>();
    for (const s of series) {
      for (const point of downsample(s.points, MAX_POINTS, (p) => p.y)) {
        const row = rows.get(point.x) ?? { x: point.x };
        row[s.key] = point.y;
        rows.set(point.x, row);
      }
    }
    return [...rows.values()].sort((a, b) => String(a.x).localeCompare(String(b.x)));
  }, [series]);

  if (data.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyMessage}</p>;
  }

  const yTitle = y.unit ? `${y.label} (${y.unit})` : y.label;
  const formatValue = (value: number) => (y.format ? y.format(value) : value.toLocaleString());
  const formatDate = (value: string) => (x.format ? x.format(value) : value);

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    >
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="x"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value: string) => formatDate(value)}
          label={{ value: x.label, position: "insideBottom", offset: -16 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={72}
          tickFormatter={(value: number) => formatValue(value)}
          label={{ value: yTitle, angle: -90, position: "insideLeft", style: { textAnchor: "middle" } }}
        />
        <ChartTooltip
          // The crosshair: a dashed rule that tracks the pointer down the chart.
          cursor={{ strokeDasharray: "4 4" }}
          content={
            <ChartTooltipContent
              // The box follows the cursor and names the row it is sitting on.
              labelFormatter={(value) => formatDate(String(value))}
              formatter={(value, name) => {
                const key = String(name);
                return (
                  <div className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatValue(Number(value))}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            type="monotone"
            stroke={`var(--color-${s.key})`}
            strokeWidth={2}
            // No dots: at these densities they'd be a solid band. The crosshair
            // is what marks the point you're actually looking at.
            dot={false}
            activeDot={{ r: 4 }}
            // Animation on a thousand points is jank, and it delays the first
            // readable frame for no benefit on a chart the user is scanning.
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
