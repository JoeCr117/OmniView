# frontend/src/app/(shell)/apps/admin-portal/costs/

## Purpose
The Costs tab: DBU usage and list-price value over a 7/30/90-day window — KPI
cards, a daily-usage chart, and a by-SKU table.

## Role in OmniView
Rendered at `/apps/admin-portal/costs`. Reads `/api/admin-portal/costs/overview?days=`
via `useResource` (each window cached under its own key, so flipping back is
instant). The chart is the shared `LazyTimeSeriesChart`.

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | Window selector + KPIs + chart (unit "DBUs") + by-SKU table. |

## Conventions & gotchas
- Free Edition actual cost is $0 — the list-price KPI says so explicitly.
- The chart owns its own empty state; the page doesn't guard it separately.

## See also
- [admin-portal/](../README.md) · [components/charts/](../../../../../components/charts/README.md)
