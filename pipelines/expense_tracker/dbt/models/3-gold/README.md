# pipelines/expense_tracker/dbt/models/3-gold/

## Purpose
The gold layer: analysis-ready tables the web layer reads directly — all
transactions, budget analysis, per-day metrics, the budget map, uncategorized
transactions, and a bank-agnostic calendar dimension.

## Role in OmniView
Gold is what Django's unmanaged models point at. Money columns are cast to
`double precision` here (consumers see floats); most models default to `view`,
with `DailyMetrics` a deliberate exception (materialized as a table for read
latency). `gold_DimDate` is bank-agnostic and lives at this level, not in a bank
subfolder.

## Contents
| Item | What it does |
|------|--------------|
| `Golden1/` | Golden1's gold models (AllTransactions, BudgetAnalysis, BudgetMap, DailyMetrics, UncategorizedTransactions). |
| _(gold_DimDate)_ | The shared calendar dimension is a bank-agnostic gold model (built at the gold level). |

## Conventions & gotchas
- Prefer a `view` unless a read is on a hot path — `DailyMetrics` is the one
  materialized as a table (see its model file for why).
- Casing/date conventions as in the `models/` README.

## See also
- [models/](../README.md) · [Golden1/](Golden1/README.md) · [2-silver/](../2-silver/README.md)
