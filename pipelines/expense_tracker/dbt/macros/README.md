# pipelines/expense_tracker/dbt/macros/

## Purpose
The dbt project's own Jinja macros — reusable SQL the models and hooks call.
These are production code: a hook macro here runs on every `dbt build`.

## Role in OmniView
Currently one macro, and it exists to keep the cloud deployment working across
service-principal changes. It runs as an `on-run-end` hook configured in
`dbt_project.yml`, not from any model.

## Contents
| Item | What it does |
|------|--------------|
| `ensure_schema_ownership.sql` | After every run, hands every relation in the target schema to a shared owner role (`omniview_owner` by default). No-ops when that role does not exist. |

## Conventions & gotchas
- **Why ownership needs fixing at all.** Postgres assigns a new object to its
  creator. In the cloud that is the Databricks App's service principal, which is
  replaced with a **new identity** every time the app is recreated. Objects built
  by a previous SP become unreadable and undroppable by the current one — role
  membership in a common group does *not* grant access to another member's
  objects.
- **Why the end of the run is the right moment.** `ALTER ... OWNER TO` requires
  that you own the object *and* belong to the target role. Both are true for the
  SP immediately after it builds something, and neither is recoverable later:
  once the owning SP is deleted, nobody can reassign its objects and only
  `DROP SCHEMA ... CASCADE` clears them.
- **It covers the whole schema, not just models**, so the pandas-staged `stg_*`
  tables are picked up as well.
- **Local runs are unaffected.** There is a single `omniview` role locally and no
  identity churn, so the guard returns early. Verified both ways: the hook
  no-ops against the real local database, and reassigns correctly when pointed at
  a throwaway role via `--vars '{shared_owner_role: ...}'`.
