# pipelines/expense_tracker/dbt/models/0-stg/Golden1/

## Purpose
Golden1's dbt source definitions: the `stg_Golden1_*` tables (one per account,
plus `BudgetMap`) that the Python ingestion staged into `datavault`.

## Role in OmniView
Bronze Golden1 models `source()` these. Adding a Golden1 account means adding its
`stg_*` table here and a bronze model.

## Contents
| Item | What it does |
|------|--------------|
| `0-sources.yml` | Declares the `stg_Golden1_*` source tables to dbt. |

## Conventions & gotchas
- These name Python-staged tables (replaced per run); dbt reads, never builds them.

## See also
- [0-stg/](../README.md) · [1-bronze/Golden1](../../1-bronze/Golden1/README.md)
