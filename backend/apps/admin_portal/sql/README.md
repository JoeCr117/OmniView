# backend/apps/admin_portal/sql/

## Purpose
File-based SQL executed against a Databricks SQL warehouse (not the app's
Postgres). Keeping the query in a `.sql` file — the AppKit convention — keeps it
readable and reviewable rather than buried in a Python string.

## Role in OmniView
`services.py` loads `dbu_usage.sql` and runs it via the SQL Statement Execution
API on `OMNIVIEW_SQL_WAREHOUSE_ID` to power the Costs tab. It joins
`system.billing.usage` to list pricing for a DBU total + by-SKU breakdown.

## Contents
| Item | What it does |
|------|--------------|
| `dbu_usage.sql` | Parameterised (`:days`) DBU usage + list-price query over `system.billing.usage`. |

## Conventions & gotchas
- This runs on a **Databricks warehouse**, not Lakebase — different engine,
  different dialect. Don't reuse Postgres idioms here.
- The `:days` parameter is validated to {7,30,90} in `services.py` before binding.

## See also
- [admin_portal/](../README.md) · `docs/DEPLOYMENT.md` "Admin Portal"
