# backend/shell/management/commands/

## Purpose
Platform-level `manage.py` subcommands: ensuring the two Postgres schemas exist,
keeping their objects on the shared owner role, and bootstrapping the isolated
E2E database.

## Role in OmniView
Two of these bracket `migrate` at container startup (`docker/entrypoint.sh` and
`deploy/databricks/databricks_start.py`): `ensure_schemas` before it,
`ensure_ownership` after. `ensure_schemas` doubles as the wait-for-db probe.
`e2e_bootstrap` builds the dedicated `omniview_e2e` database Playwright serves —
it refuses to run unless `settings.IS_E2E`, because it wipes what the settings
point at.

## Contents
| Item | What it does |
|------|--------------|
| `ensure_schemas.py` | `CREATE SCHEMA IF NOT EXISTS omniview, datavault`; no-ops on non-Postgres (test settings). |
| `ensure_ownership.py` | Hands every `omniview` relation to `omniview_owner`; no-ops where that role is absent. |
| `e2e_bootstrap.py` | Drops/recreates `omniview_e2e`, migrates, seeds users + gold tables + fixture banks. |

## Conventions & gotchas
- **`ensure_ownership` must run immediately after `migrate`, as the app.**
  Postgres gives a new table to its creator; in the cloud that is a service
  principal replaced on every `apps create`. Only the creator may reassign, and
  once it is deleted nobody can — so this is the single moment the fix is
  possible. It is the `omniview` counterpart to the dbt `on-run-end` hook that
  covers `datavault`; the two must agree on the role name.
- **It is deliberately non-fatal** at both call sites (`|| true` / `check=False`).
  Drift makes the *next* recreate painful but breaks nothing today, so refusing
  to boot over it would turn a latent problem into an outage.
- `e2e_bootstrap` delegates demo-data seeding to
  `apps/expense_tracker/tests/fixtures.py:seed_demo_data()` — keep seeding there,
  not here.
- The `IS_E2E` guard is a safety interlock; a pytest covers it.

## See also
- [shell/](../../README.md) · [config/settings/](../../../config/settings/README.md)
