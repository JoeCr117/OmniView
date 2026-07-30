# pipelines/expense_tracker/dbt/models/1-bronze/

## Purpose
The bronze layer: near-1:1 typed casts of the staged tables — one model per
account plus one for the BudgetMap. Minimal logic; the job is correct types and
indexes.

## Role in OmniView
Bronze sits on the `0-stg` sources and feeds silver. Bronze models are
materialized as **tables** and declare indexes via dbt-postgres's native
`indexes=[...]` config (unlike silver/gold, which default to views).

## Contents
| Item | What it does |
|------|--------------|
| `Golden1/` | Golden1's bronze models (per-account casts + BudgetMap). |

## Conventions & gotchas
- Type mistakes are cheap to make here and expensive later — e.g. a `VARCHAR(n)`
  cast truncates in Postgres where SQLite never did; keys are cast to the right
  width deliberately.

## See also
- [models/](../README.md) · [Golden1/](Golden1/README.md) · [0-stg/](../0-stg/README.md) · [2-silver/](../2-silver/README.md)
