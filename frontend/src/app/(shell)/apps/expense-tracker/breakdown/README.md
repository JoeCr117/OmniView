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
| `page.tsx` | Fetch + slicer state, composing `YearMonthSlicer` and `BreakdownMatrix`. |

## Conventions & gotchas
- Slicer semantics mirror Power BI: an empty selection means *all*, a plain click
  selects one (clicking the only selection clears it), shift/ctrl extends.
- Amounts are the warehouse's signed nets — expenses negative, income positive —
  so the matrix totals tie to the account totals rather than to "spend".
- Drill state belongs to each visual, as in Power BI: the matrix owns its own and
  does not reset when the slicers change.

## See also
- [expense-tracker/](../README.md) · [check-book/](../check-book/README.md) · [components/](../../../../../apps/expense-tracker/components/README.md)
