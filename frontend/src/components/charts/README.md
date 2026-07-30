# frontend/src/components/charts/

## Purpose
The one chart primitive and its supporting code. Every chart in OmniView goes
through `TimeSeriesChart` so that the things that make a chart *readable* — both
axes titled, the value axis carrying its unit, a crosshair, a cursor tooltip
naming the row — happen by construction, not per page.

## Role in OmniView
Import it as `LazyTimeSeriesChart` (Recharts is ~100KB; most pages plot nothing,
so it's lazy behind a `ChartSkeleton`). `ariaLabel` is a **required** prop — the
chart this replaced hardcoded one, so it described every chart as a balance chart.
Long series are thinned by LTTB, which selects *real* rows so the crosshair lands
on a genuine day.

## Contents
| Item | What it does |
|------|--------------|
| `TimeSeriesChart.tsx` | The chart: titled axes + unit, crosshair, cursor tooltip; downsamples each series. |
| `LazyTimeSeriesChart.tsx` | `next/dynamic` wrapper (`ssr:false`, ChartSkeleton fallback) that keeps Recharts out of the initial bundle. |
| `downsample.ts` | LTTB (Largest-Triangle-Three-Buckets) — thins to ~1,000 real points. |
| `*.test.*` | Assert axis units, required ariaLabel, empty state, LTTB spike preservation. |

## Conventions & gotchas
- Use `LazyTimeSeriesChart`, not the raw component, at call sites.
- The Recharts chunk must stay referenced by no exported HTML page (verified in
  the build) — don't statically import it into a shared module.
- Test infra note: the `ResizeObserver` stub must report a size, or Recharts
  draws nothing at 0×0 in jsdom (see `src/test/setup.ts`).

## See also
- [components/](../README.md) · [src/test/](../../test/README.md) · [docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md)
