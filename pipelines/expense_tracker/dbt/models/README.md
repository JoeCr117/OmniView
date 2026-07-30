# pipelines/expense_tracker/dbt/models/

## Purpose
The dbt models, organized as a medallion architecture: one folder per layer, with
a per-bank subfolder inside each. Data flows `0-stg` (sources) → `1-bronze`
(typed casts) → `2-silver` (cleaned/reshaped) → `3-gold` (analysis-ready).

## Role in OmniView
These build the `datavault` tables the web layer's unmanaged models read. Layer
tags, materialization, and docs colours are set per-layer in `dbt_project.yml`,
not per model.

## Contents
| Item | What it does |
|------|--------------|
| `0-stg/` | Source definitions pointing at the Python-staged `stg_*` tables. |
| `1-bronze/` | Near-1:1 typed casts (materialized as tables, with indexes). |
| `2-silver/` | Cleaned/reshaped tables (daily balances, daily transactions). |
| `3-gold/` | Analysis tables (AllTransactions, BudgetAnalysis, DailyMetrics, DimDate, …). |

## Conventions & gotchas
- **Naming**: everything lives in the single `datavault` schema as
  `{LAYER}_{BANK}_{TABLENAME}` — a SQLite-era convention kept so the consuming
  Django unmanaged models never changed.
- **Dates**: carried as `YYYY-MM-DD` TEXT alongside integer `DateSK` (`YYYYMMDD`)
  surrogate keys for joins/sorting — also inherited and kept for compatibility.
- **Casing**: models write unquoted CamelCase (Postgres folds to lowercase);
  relation names (`db_table`) stay CamelCase (dbt-postgres quotes them).
- Gold views cast money to `double precision`; bronze/silver keep DECIMAL.

## See also
- [dbt/](../README.md) · [0-stg/Golden1](0-stg/Golden1/README.md) · [1-bronze/Golden1](1-bronze/Golden1/README.md) · [2-silver/Golden1](2-silver/Golden1/README.md) · [3-gold/Golden1](3-gold/Golden1/README.md)
