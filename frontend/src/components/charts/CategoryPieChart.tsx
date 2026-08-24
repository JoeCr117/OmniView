"use client";

import { useMemo, useRef } from "react";
import { Cell, Legend, Pie, PieChart } from "recharts";

import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

/**
 * Parts of a whole, by identity.
 *
 * Colour here carries *identity*, not order or magnitude, so it comes from the
 * categorical slots (`--chart-cat-1..8`) - eight hues in fixed order, validated
 * for separation under the three common colour-vision deficiencies rather than
 * chosen by eye. There are only eight on purpose: past that, adjacent classes
 * stop being tellable apart, so a ninth category **folds into "Other"** instead
 * of inventing a hue. Other is drawn in a neutral, because it is not a category.
 *
 * Identity is never carried by colour alone: every slice is in the legend, the
 * large ones are labelled directly on the chart, and all of them are in the
 * tooltip. Labels are selective by design - a number on every sliver is the
 * fastest way to make a pie unreadable.
 */

/** The slice geometry Recharts hands a label renderer. */
interface PieLabelGeometry {
  index?: number;
  cx?: number;
  outerRadius?: number;
}

export interface PieSliceDatum {
  key: string;
  label: string;
  /** A positive magnitude. */
  value: number;
  /** Share of the whole, 0-100. */
  pct: number;
}

/** Fixed order, never cycled. A ninth series folds into Other. */
const CATEGORICAL_SLOTS = 8;

const FOLDED_KEY = "__other__";

/** Below this share a direct label is unreadable and collides with its neighbours. */
const LABEL_MIN_PCT = 5;

/**
 * Horizontal room outside the pie, in px, needed before a label can afford to
 * name its slice and its value rather than just the share. Measured against the
 * longest real label ("Uncategorized $46,059 (26.06%)"); below it, those strings
 * clip against the pane edge and each other, which is how the legacy report's
 * layout fails when it is not given half a screen.
 */
const FULL_LABEL_ROOM = 190;

/** What a slice outside the current selection fades to. */
const DIMMED = 0.3;

function colorFor(index: number, key: string): string {
  if (key === FOLDED_KEY) return "var(--chart-other)";
  return `var(--chart-cat-${(index % CATEGORICAL_SLOTS) + 1})`;
}

/**
 * Keep the largest slices and fold the tail into one "Other".
 *
 * Exported for its own test: this is the rule that keeps the palette honest,
 * and it is easier to trust when it is checked directly.
 */
export function foldToPalette(
  slices: readonly PieSliceDatum[],
  limit = CATEGORICAL_SLOTS,
): PieSliceDatum[] {
  if (slices.length <= limit) return [...slices];

  const kept = slices.slice(0, limit);
  const folded = slices.slice(limit);
  const value = folded.reduce((sum, slice) => sum + slice.value, 0);
  const pct = folded.reduce((sum, slice) => sum + slice.pct, 0);
  return [
    ...kept,
    {
      key: FOLDED_KEY,
      label: `Other (${folded.length})`,
      value: Math.round(value * 100) / 100,
      pct: Math.round(pct * 100) / 100,
    },
  ];
}

/**
 * What a slice's direct label says, given the horizontal room outside the pie.
 *
 * Wide: "Name $Value (pct%)", as the source report wrote it. Squeezed: the share
 * alone, because the long form clips against the pane edge and its neighbours.
 * Too small a share: nothing — a number on every sliver is the fastest way to
 * make a pie unreadable. The name is always in the legend and the value always
 * in the tooltip, so no label is the only route to a fact.
 */
export function sliceLabelText(
  slice: PieSliceDatum,
  room: number,
  format: (value: number) => string,
): string | null {
  if (slice.pct < LABEL_MIN_PCT) return null;
  return room >= FULL_LABEL_ROOM
    ? `${slice.label} ${format(slice.value)} (${slice.pct}%)`
    : `${slice.pct}%`;
}

export function CategoryPieChart({
  slices,
  ariaLabel,
  format,
  height = 260,
  emptyMessage = "Nothing to show for this selection.",
  className,
  highlightKeys,
  onSelect,
}: {
  /** Largest first; the caller decides the order, this decides what fits. */
  slices: readonly PieSliceDatum[];
  /** Required: what this chart is *of*. Screen readers get nothing else. */
  ariaLabel: string;
  /** How a magnitude is written in labels and the tooltip. */
  format?: (value: number) => string;
  /** A pixel height, or a CSS length like "100%" to fill a sized parent. */
  height?: number | string;
  emptyMessage?: string;
  className?: string;
  /** Slices to keep bright; every other slice dims. Empty or absent dims nothing. */
  highlightKeys?: readonly string[];
  /** Reports which slice was clicked, and whether the reader was extending a selection. */
  onSelect?: (key: string, extend: boolean) => void;
}) {
  const data = useMemo(() => foldToPalette(slices), [slices]);

  // Recharts' own click handlers do not carry the modifier keys, so read them
  // off the native event on the way down instead of from the synthetic one.
  const extendRef = useRef(false);
  const dimmed = highlightKeys !== undefined && highlightKeys.length > 0;

  const config = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        data.map((slice, index) => [
          slice.key,
          { label: slice.label, color: colorFor(index, slice.key) },
        ]),
      ),
    [data],
  );

  if (data.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyMessage}</p>;
  }

  const formatValue = (value: number) => (format ? format(value) : value.toLocaleString());

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
      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const slice = payload[0]?.payload as PieSliceDatum | undefined;
            if (!slice) return null;
            return (
              <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                <div className="font-medium">{slice.label}</div>
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>{formatValue(slice.value)}</span>
                  <span className="font-mono tabular-nums">{slice.pct}%</span>
                </div>
              </div>
            );
          }}
        />
        <Pie
          data={data as PieSliceDatum[]}
          dataKey="value"
          nameKey="label"
          outerRadius="72%"
          isAnimationActive={false}
          // A hairline of surface between slices, so adjacent fills never touch.
          stroke="var(--background)"
          strokeWidth={2}
          // The label says as much as it has room to say. Given a wide pane it
          // writes "Name $Value (pct%)", as the source report did; squeezed, it
          // falls back to the share alone rather than clipping against the edge.
          // Either way the name is in the legend and the value is in the tooltip,
          // so nothing is only ever available in the label.
          label={({ index, cx, outerRadius }: PieLabelGeometry) => {
            const slice = index === undefined ? undefined : data[index];
            if (!slice) return null;
            return sliceLabelText(slice, (cx ?? 0) - (outerRadius ?? 0), formatValue);
          }}
          labelLine={({ index, points }: { index?: number; points?: { x: number; y: number }[] }) => {
            const slice = index === undefined ? undefined : data[index];
            if (!slice || slice.pct < LABEL_MIN_PCT || !points || points.length < 2) {
              return <g />;
            }
            const [from, to] = points;
            return (
              <path
                d={`M${from.x},${from.y}L${to.x},${to.y}`}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.5}
                fill="none"
              />
            );
          }}
          onClick={(_entry, index) => {
            const slice = data[index];
            // Other is an aggregate, not a category: it cannot filter to anything.
            if (!slice || slice.key === FOLDED_KEY || !onSelect) return;
            onSelect(slice.key, extendRef.current);
          }}
        >
          {data.map((slice, index) => (
            <Cell
              key={slice.key}
              fill={colorFor(index, slice.key)}
              fillOpacity={!dimmed || highlightKeys.includes(slice.key) ? 1 : DIMMED}
              cursor={onSelect && slice.key !== FOLDED_KEY ? "pointer" : undefined}
            />
          ))}
        </Pie>
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconSize={8}
          // Recharts' legend defaults to itemSorter "value", which sorts
          // alphabetically and so explains the chart in an order the chart does
          // not use. Off, it follows the sectors: largest slice first.
          itemSorter={null}
          formatter={(value: string) => <span className="text-xs text-foreground">{value}</span>}
        />
      </PieChart>
    </ChartContainer>
  );
}
