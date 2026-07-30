# backend/apps/expense_tracker/dailymetrics/

## Purpose
Read-only API over the gold `DailyMetrics` table: one row per calendar date with
per-account end-of-day balances and transaction totals. This is the payload
behind Check Book and Daily Trends.

## Role in OmniView
Serves `/api/expense-tracker/dailymetrics`. The model is unmanaged and routed to
`datavault`; the pipeline owns the underlying relation. The frontend fetches the
whole history once (shared cache key) and slices/plots it client-side.

## Contents
| Item | What it does |
|------|--------------|
| `models.py` | `DailyMetric` — unmanaged, `db_table = gold_Golden1_DailyMetrics`, PK on `date_sk`. |
| `api.py` | Paginated list (`start`/`end` filters) + a `/summary` latest-row endpoint. |
| `schemas.py` | `DailyMetricOut`. |
| `apps.py` | AppConfig with the pinned label. |
| `tests/` | Endpoint tests. |

## Conventions & gotchas
- The underlying gold relation is **materialized as a table** (not a view) for
  read latency — see `pipelines/.../gold_Golden1_DailyMetrics.sql`; as a view it
  recomputed silver window functions on every read (~1s → ~30ms as a table).
- Field names stay CamelCase in the API JSON; `db_column`s are lowercase.

## See also
- [expense_tracker/](../README.md) · [transactions/](../transactions/README.md) · [tests/](tests/README.md)
