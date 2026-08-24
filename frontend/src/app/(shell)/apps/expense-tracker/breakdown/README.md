# frontend/src/app/(shell)/apps/expense-tracker/breakdown/

## Purpose
The Breakdown report: the legacy Power BI page rebuilt in-app — a drillable
matrix of nets by date and label across the account columns, with year/month
slicers, and (as the remaining milestones land) a waterfall, a pie, and Power BI
cross-filtering between all three.

## Role in OmniView
Rendered at `/apps/expense-tracker/breakdown`. Reads the whole transaction fact
once via `useResource(BREAKDOWN_KEY, getBreakdown)` and recomputes every view of
it client-side, so slicer clicks and drills cost no request. The arithmetic is
`lib/breakdown.ts`; the drill state machine is `lib/drill.ts`; the visuals are in
`apps/expense-tracker/components/`.

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | Fetch, slicer state and cross-filter routing, composing the slicer and the three visuals. |
| `page.test.tsx` | The wiring: one fetch, slicer scoping, cross-filter routing, highlight targeting, Restart. |

## Conventions & gotchas
- Slicer semantics mirror Power BI: an empty selection means *all*, a plain click
  selects one (clicking the only selection clears it), shift/ctrl extends.
- Amounts are the warehouse's signed nets — expenses negative, income positive —
  so the matrix totals tie to the account totals rather than to "spend".
- Drill state belongs to each visual, as in Power BI: the matrix owns its own and
  does not reset when the slicers change.
- **Two filters compose, in this order**: the slicers scope the page, then a
  cross-filter selection narrows the visuals that did not make it. A visual never
  filters itself — it keeps its whole data and dims the marks outside the
  selection, or the pie would collapse to a single 100% slice with no way back.
- Restart clears selections *and* slicers; it disables itself when there is
  nothing to clear.
- **This page is full-width and, from `xl`, exactly as tall as the viewport
  pane** — three linked visuals are read together, so it should not make the
  reader scroll between them, and a centred `max-w-*` column would waste the
  width the matrix's six currency columns want. That is why `ViewportPane` is a
  flex column: the page claims the height left over after the app's subnav
  without hardcoding that subnav's height. Other pages stay capped and
  content-sized.

## See also
- [expense-tracker/](../README.md) · [check-book/](../check-book/README.md) · [components/](../../../../../apps/expense-tracker/components/README.md)
