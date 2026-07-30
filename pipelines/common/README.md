# pipelines/common/

## Purpose
The bits any pipeline can reuse, independent of a specific bank or app: process
helpers, a working-directory context manager, the Postgres engine + schema names,
and the `pydbt` fluent dbt-CLI wrapper.

## Role in OmniView
`expense_tracker/main.py` imports these. Keeping them here (rather than in an
app's package) is what makes "add a second pipeline" a matter of writing a new
`<app>/main.py`, not re-solving dbt invocation and DB connection.

## Contents
| Item | What it does |
|------|--------------|
| `process.py` | `run_command` (raises on non-zero) + `timed` — the single copy (they used to be duplicated). |
| `paths.py` | `temp_cd` — chdir context manager (used to enter the dbt project dir). |
| `postgres.py` | `pg_engine()` (SQLAlchemy, from `PG*` env) + the schema-name constants. |
| `pydbt/` | The fluent builder around invoking the `dbt` CLI. |

## Conventions & gotchas
- `run_command`/`timed` are the deduplicated versions — don't reintroduce a
  second copy.
- `pg_engine` reads the same `PG*` env vars as Django and dbt (compose-matching
  defaults).

## See also
- [pipelines/](../README.md) · [pydbt/](pydbt/README.md) · [expense_tracker/](../expense_tracker/README.md)
