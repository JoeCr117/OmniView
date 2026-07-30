# pipelines/expense_tracker/dbt/models/1-bronze/Golden1/

## Purpose
Golden1's bronze models: typed casts of each account's staged table plus the
BudgetMap, with indexes declared for the join columns silver needs.

## Role in OmniView
These read the `0-stg/Golden1` sources and are read by `2-silver/Golden1`. One
model per account.

## Contents
| Item | What it does |
|------|--------------|
| `bronze_Golden1_CreditCard.sql` `…_FreeChecking` `…_MoneyMarket` `…_Savings` | Per-account typed casts. |
| `bronze_Golden1_BudgetMap.sql` | Typed cast of the flattened budget/category map. |

## Conventions & gotchas
- Materialized as tables (indexes require it).
- Each model declares its own `indexes` in its `config()` block — there is no
  separate schema YAML at this layer.
- Unquoted CamelCase SQL → Postgres lowercase in-db; relation names stay CamelCase.

## See also
- [1-bronze/](../README.md) · [0-stg/Golden1](../../0-stg/Golden1/README.md) · [2-silver/Golden1](../../2-silver/Golden1/README.md)
