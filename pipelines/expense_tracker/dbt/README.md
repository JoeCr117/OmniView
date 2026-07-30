# pipelines/expense_tracker/dbt/

## Purpose
The dbt project that transforms the staged bank data into analysis-ready tables,
using a medallion architecture (bronze → silver → gold). It also carries its own
data tests, which run as part of `dbt build`.

## Role in OmniView
`main.py` stages `stg_*` tables into `datavault`, then runs this project
(`pydbt.DBT().run_all()`) to build everything the web layer reads. It targets
dbt-postgres (`profiles.yml`, single target `pg`, `PG*` env with compose-matching
defaults); models land in the `datavault` schema.

## Contents
| Item | What it does |
|------|--------------|
| `dbt_project.yml` | Project config: per-layer tags, materialization, `node_color` for docs. |
| `profiles.yml` | The single `pg` target (dbt-postgres, `PG*` env). |
| `packages.yml` · `package-lock.yml` | dbt package deps. |
| `models/` | The medallion layers (`0-stg` → `1-bronze` → `2-silver` → `3-gold`). |
| `tests/` | dbt data tests (production code — shipped in the deploy bundle). |

## Conventions & gotchas
- Prefer the `pydbt.DBT` wrapper over the raw CLI. To run by hand: `cd` here and
  use `--profiles-dir .`.
- The deploy bundle prunes `tests/` out of `backend/` but **keeps** these — they
  are production data tests.
- Empty starter dirs (`analyses`, `seeds`, `snapshots`, `macros`) carry only a
  `.gitkeep` and are intentionally undocumented until they hold something.

## See also
- [expense_tracker/](../README.md) · [models/](models/README.md) · [tests/](tests/README.md) · [pydbt/](../../common/pydbt/README.md)
