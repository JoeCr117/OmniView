# pipelines/expense_tracker/dbt/models/2-silver/Golden1/

## Purpose
Golden1's silver models: cleaned per-account tables plus the two derived rollups —
end-of-day balances and daily transaction totals — that gold DailyMetrics joins.

## Role in OmniView
Reads `1-bronze/Golden1`; read by `3-gold/Golden1`. `DailyBalances` and
`DailyTransactions` are the window-function-heavy models behind the day grid.

## Contents
| Item | What it does |
|------|--------------|
| `silver_Golden1_CreditCard.sql` `…_FreeChecking` `…_MoneyMarket` `…_Savings` | Cleaned per-account tables. |
| `silver_Golden1_DailyBalances.sql` | Per-day end-of-day balance per account (running/intraday windows). |
| `silver_Golden1_DailyTransactions.sql` | Per-day transaction totals per account. |
| `silver_Golden1_BudgetMap.sql` | Reshaped budget/category map. |

## Conventions & gotchas
- The window functions here recompute over the whole partition on every read;
  that's why the gold model joining them is a **table**, not a view.

## See also
- [2-silver/](../README.md) · [3-gold/Golden1](../../3-gold/Golden1/README.md)
