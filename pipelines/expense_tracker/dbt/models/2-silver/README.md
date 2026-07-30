# pipelines/expense_tracker/dbt/models/2-silver/

## Purpose
The silver layer: cleaned and reshaped tables built on bronze — per-account
normalization plus the derived daily-balance and daily-transaction rollups that
gold assembles into per-day metrics.

## Role in OmniView
Silver reads bronze and feeds gold. Its `DailyBalances`/`DailyTransactions`
models carry the running/intraday-balance window functions — which is why the
gold DailyMetrics model that joins them is materialized as a table (recomputing
these on every read was the ~1s hot-path cost).

## Contents
| Item | What it does |
|------|--------------|
| `Golden1/` | Golden1's silver models (per-account + daily balances/transactions + BudgetMap). |

## Conventions & gotchas
- Silver defaults to `view`; the expensive window functions here are why a
  downstream gold read must be materialized.

## See also
- [models/](../README.md) · [Golden1/](Golden1/README.md) · [1-bronze/](../1-bronze/README.md) · [3-gold/](../3-gold/README.md)
