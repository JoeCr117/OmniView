# frontend/src/components/charts/

## Purpose
The chart primitives and their supporting code. Every chart in OmniView goes
through one of them so that the things that make a chart *readable* — both axes
titled, the value axis carrying its unit, a cursor tooltip naming the row —
happen by construction, not per page.

## Role in OmniView
Import each through its `Lazy*` wrapper (Recharts is ~100KB; most pages plot
nothing, so it's lazy behind a `ChartSkeleton`). `ariaLabel` is a **required**
prop on every primitive — the chart this replaced hardcoded one, so it described
every chart as a balance chart. Pick by what the page is saying: a value over
time, or how a running total got where it did.

## Contents
| Item | What it does |
|------|--------------|
| `TimeSeriesChart.tsx` | Value over time: titled axes + unit, crosshair, cursor tooltip; downsamples each series. |
| `WaterfallChart.tsx` | How a running total got here: floating bars, connectors, green up / red down / primary total. |
| `Lazy*.tsx` | `next/dynamic` wrappers (`ssr:false`, ChartSkeleton fallback) that keep Recharts out of the initial bundle. |
| `downsample.ts` | LTTB (Largest-Triangle-Three-Buckets) — thins to ~1,000 real points. |
| `*.test.*` | Assert axis units, required ariaLabel, empty state, LTTB spike preservation, waterfall colour/selection. |

## Conventions & gotchas
- Use the `Lazy*` wrapper, not the raw component, at call sites.
- **Waterfall bars are Recharts *range* bars** (`dataKey` yielding `[min, max]`),
  not a transparent spacer stacked under a visible bar: stacking splits positive
  and negative values into separate stacks, so any bar below zero lands wrong.
- Waterfall colour carries the sign, but so does position — the chart still reads
  in greyscale, or to someone who cannot separate the two hues.
- The waterfall drops its per-bar value labels past 8 bars and angles its ticks
  past 12: a label that overlaps its neighbour is worse than no label, and the
  tooltip still carries the exact number. `showValueLabels` overrides.
- These primitives may not import app code (`apps/<id>/*`); a chart that needs an
  app's types is the wrong shape. They define their own datum types, which the
  app's are structurally compatible with.
- The Recharts chunk must stay referenced by no exported HTML page (verified in
  the build) — don't statically import it into a shared module.
- Test infra note: the `ResizeObserver` stub must report a size, or Recharts
  draws nothing at 0×0 in jsdom (see `src/test/setup.ts`).

## See also
- [components/](../README.md) · [src/test/](../../test/README.md) · [docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md)
