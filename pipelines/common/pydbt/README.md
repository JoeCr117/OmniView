# pipelines/common/pydbt/

## Purpose
A small first-party fluent builder around invoking the `dbt` CLI as a subprocess.
**Not a dbt package** — it accumulates validated CLI args and composes the
debug → clean → deps → build sequence so project-dir/profiles-dir/log-path stay
consistent across every call.

## Role in OmniView
`main.py` uses `DBT().run_all()` instead of shelling out to raw `dbt`, so the
pipeline never drifts on flags. Each high-level method runs `run_command` (raises
on non-zero exit); `run_all()` composes them.

## Contents
| Item | What it does |
|------|--------------|
| `core.py` | `DBT` — the builder: `set_project_dir`/`set_select`/`set_vars`/… and `run_debug`/`run_clean`/`run_deps`/`run_build`/`run_all`. |
| `types.py` | `DBT_ARGS_N_TYPES` — the arg→type table the builder validates against. |

## Conventions & gotchas
- A private `_set`/`_used_keys` mechanism rejects setting the same flag twice and
  type-checks values; `_temporarily_remove_args` lets `run_deps()` drop
  `--project-dir` (which `dbt deps` rejects) without disturbing the rest.
- If you must run `dbt` by hand, `cd` into the dbt project and use
  `--profiles-dir .` — but prefer this wrapper.

## See also
- [common/](../README.md) · [expense_tracker/dbt/](../../expense_tracker/dbt/README.md)
