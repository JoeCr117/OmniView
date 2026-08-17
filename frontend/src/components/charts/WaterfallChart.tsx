"use client";

import { useMemo, useRef } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

/**
 * A waterfall: how a running total got where it did.
 *
 * Each bar floats between the running total before it and after it, so the
 * reader sees the contribution, not the cumulative value - and a thin connector
 * carries the eye from one bar's end to the next bar's start, which is what
 * makes the sequence read as one story rather than as unrelated columns.
 *
 * Bars are drawn as Recharts *range* bars (`dataKey` yielding `[min, max]`)
 * rather than a transparent spacer stacked under a visible bar: stacking splits
 * positive and negative values into separate stacks, so any bar sitting below
 * zero lands in the wrong place.
 *
 * Colour carries the sign - green up, red down, and the closing Total in the
 * primary series colour - but so does position, so the chart survives being
 * read in greyscale or by someone who cannot separate the two hues.
 */

export interface WaterfallDatum {
  /** Stable identity, for selection. Not shown. */
  key: string;
  label: string;
  /** The contribution: this bar's height and sign. */
  delta: number;
  /** Running total before and after this bar. */
  start: number;
  end: number;
  kind: "increase" | "decrease" | "total";
}

export interface WaterfallAxisSpec {
  label: string;
  format?: (value: string) => string;
}

export interface WaterfallValueSpec {
  label: string;
  /** "USD". Appended to the axis title, so the reader never has to guess. */
  unit?: string;
  /** Bar labels and the tooltip: the exact value. */
  format?: (value: number) => string;
  /** Axis ticks, where the exact value is noise and a long one collides with the axis title. */
  tickFormat?: (value: number) => string;
}

const FILL: Record<WaterfallDatum["kind"], string> = {
  increase: "var(--chart-2)",
  decrease: "var(--chart-4)",
  total: "var(--chart-1)",
};

/** Past this many bars, horizontal tick labels collide and Recharts starts dropping them. */
const ANGLE_TICKS_ABOVE = 12;

/**
 * Past this many bars, per-bar value labels overlap into an unreadable smear.
 * The tooltip still carries the exact number, so dropping them loses nothing a
 * reader could actually have read.
 */
const LABEL_BARS_UP_TO = 8;

/** What a cross-filtered-away bar fades to: still legible, clearly not the subject. */
const DIMMED = 0.3;

export function WaterfallChart({
  bars,
  x,
  y,
  ariaLabel,
  height = 260,
  emptyMessage = "No data for this range.",
  className,
  highlightKeys,
  onSelect,
  showValueLabels,
}: {
  bars: readonly WaterfallDatum[];
  x: WaterfallAxisSpec;
  y: WaterfallValueSpec;
  /** Required: what this chart is *of*. Screen readers get nothing else. */
  ariaLabel: string;
  height?: number;
  emptyMessage?: string;
  className?: string;
  /** Bars to keep bright; every other bar dims. Empty or absent dims nothing. */
  highlightKeys?: readonly string[];
  /** Reports which bar was clicked, and whether the reader was extending a selection. */
  onSelect?: (key: string, extend: boolean) => void;
  /** Per-bar value labels. Defaults to on only while they still fit. */
  showValueLabels?: boolean;
}) {
  const data = useMemo(
    () =>
      bars.map((bar) => ({
        ...bar,
        span: [Math.min(bar.start, bar.end), Math.max(bar.start, bar.end)] as [number, number],
      })),
    [bars],
  );

  const config = useMemo<ChartConfig>(() => ({ span: { label: y.label } }), [y.label]);

  // Recharts' own click handlers do not carry the modifier keys, so read them
  // off the native event on the way down instead of from the synthetic one.
  const extendRef = useRef(false);
  const dimmed = highlightKeys !== undefined && highlightKeys.length > 0;

  if (data.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyMessage}</p>;
  }

  const yTitle = y.unit ? `${y.label} (${y.unit})` : y.label;
  const formatValue = (value: number) => (y.format ? y.format(value) : value.toLocaleString());
  const formatTick = (value: number) =>
    y.tickFormat ? y.tickFormat(value) : formatValue(value);
  const formatCategory = (value: string) => (x.format ? x.format(value) : value);
  const angled = data.length > ANGLE_TICKS_ABOVE;
  const labelled = showValueLabels ?? data.length <= LABEL_BARS_UP_TO;

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto w-full", className)}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
      onClickCapture={(event) => {
        extendRef.current = event.ctrlKey || event.shiftKey || event.metaKey;
      }}
    >
      <BarChart data={data} margin={{ top: 16, right: 16, bottom: angled ? 40 : 24, left: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
          angle={angled ? -35 : 0}
          textAnchor={angled ? "end" : "middle"}
          height={angled ? 64 : 30}
          tickFormatter={formatCategory}
          label={{ value: x.label, position: "insideBottom", offset: angled ? -32 : -16 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={84}
          tickFormatter={formatTick}
          label={{
            value: yTitle,
            angle: -90,
            position: "insideLeft",
            style: { textAnchor: "middle" },
          }}
        />
        <ChartTooltip
          cursor={{ fillOpacity: 0.1 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) => {
                const bar = payload?.[0]?.payload as WaterfallDatum | undefined;
                return bar ? formatCategory(bar.label) : "";
              }}
              formatter={(_value, _name, item) => {
                const bar = (item as { payload?: WaterfallDatum }).payload;
                if (!bar) return null;
                return (
                  <div className="flex w-full justify-between gap-3">
                    <span className="text-muted-foreground">{y.label}</span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatValue(bar.delta)}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        {/* The connectors: each bar's end is the next bar's start, so these are
            the flat rules that make the running total legible as a sequence.
            The closing Total bar is not connected - it restates the whole. */}
        {data.slice(0, -1).map((bar, index) => {
          const next = data[index + 1];
          if (!next || next.kind === "total") return null;
          return (
            <ReferenceLine
              key={`connector-${bar.key}`}
              segment={[
                { x: bar.label, y: bar.end },
                { x: next.label, y: next.start },
              ]}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              strokeOpacity={0.5}
              ifOverflow="extendDomain"
            />
          );
        })}
        <Bar
          dataKey="span"
          isAnimationActive={false}
          onClick={(_entry, index) => {
            const bar = data[index];
            if (bar && onSelect) onSelect(bar.key, extendRef.current);
          }}
        >
          {data.map((bar) => (
            <Cell
              key={bar.key}
              fill={FILL[bar.kind]}
              fillOpacity={!dimmed || highlightKeys.includes(bar.key) ? 1 : DIMMED}
              cursor={onSelect ? "pointer" : undefined}
            />
          ))}
          {labelled && (
            <LabelList
              dataKey="delta"
              position="top"
              className="fill-muted-foreground"
              fontSize={11}
              formatter={(value) => (value === undefined ? "" : formatValue(Number(value)))}
            />
          )}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
