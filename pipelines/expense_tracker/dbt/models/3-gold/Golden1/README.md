# pipelines/expense_tracker/dbt/models/3-gold/Golden1/

## Purpose
Golden1's gold, analysis-ready models — the exact relations the web layer's
unmanaged ORM models read.

## Role in OmniView
Most map 1:1 to a Django model / API endpoint: DailyMetrics → Check Book / Daily
Trends; AllTransactions + UncategorizedTransactions → the transactions app;
BudgetMap → the budgets views. `BudgetAnalysis` is the exception — it serves
BI/SQL consumers, while the `/budget-analysis` endpoint computes the same figures
in the ORM because it accepts a start/end window this whole-history view cannot
be re-sliced by.

## Contents
| Item | What it does |
|------|--------------|
| `gold_Golden1_DailyMetrics.sql` | Per-day balances + transaction totals. **Materialized as a table** (hot read). |
| `gold_Golden1_AllTransactions.sql` | Every categorized transaction. |
| `gold_Golden1_UncategorizedTransactions.sql` | Transactions matching no BudgetMap string. |
| `gold_Golden1_BudgetAnalysis.sql` | Budget vs. actual per (Category, SubCategory), over all history. |
| `gold_Golden1_BudgetMap.sql` | The flattened budget/category map for consumers. |

## Conventions & gotchas
- `DailyMetrics` is a table, not a view — as a view it re-ran silver's balance
  window functions on every read (~1s → ~30ms as a table). Django reads the same
  relation name regardless.
- Money columns are `double precision` at this boundary.
- `BudgetAnalysis.Actual` is a **signed** sum whose sign follows each account
  type's convention (credit-card amounts arrive negated, deposit accounts do
  not). It is not "spend, always positive" — the model's header comment explains
  why that cannot be normalized at this layer.

## See also
- [3-gold/](../README.md) · [backend dailymetrics](../../../../../../backend/apps/expense_tracker/dailymetrics/README.md)
