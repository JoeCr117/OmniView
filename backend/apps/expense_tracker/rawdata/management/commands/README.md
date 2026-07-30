# backend/apps/expense_tracker/rawdata/management/commands/

## Purpose
The `import_banks_dir` command: a one-time/idempotent loader that reads a
`Data/Banks`-style tree (a bank's budget-map YAML + per-account CSVs) into the
managed `BudgetMapDocument` / `RawFile` tables.

## Role in OmniView
This is how source data first enters a deployment (local, Docker, or Lakebase)
and how a backup is restored. It `update_or_create`s, so re-running refreshes
content safely. The E2E bootstrap calls it on the fixture bank tree.

## Contents
| Item | What it does |
|------|--------------|
| `import_banks_dir.py` | Walks the tree, upserts the budget map + each account's CSVs. |

## Conventions & gotchas
- Against Lakebase it is run with the owner's creds (import only) — never run the
  *pipeline* against Lakebase that way (ownership rule).
- `Data/` is the production source tree; this command reads it but tests never do.

## See also
- [rawdata/](../../README.md) · [shell/management/commands/](../../../../../shell/management/commands/README.md)
