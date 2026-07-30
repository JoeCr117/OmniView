# backend/apps/expense_tracker/rawdata/

## Purpose
Stores each account's raw bank-export CSVs as managed Postgres rows and exposes
read/upload endpoints plus the one-time bulk importer. This is the untouched
source that every rebuild re-parses.

## Role in OmniView
The Raw CSVs page reads/uploads through `/api/expense-tracker/rawdata/*`. Rows
live in the `omniview` schema (managed, survive rebuilds); the pipeline reads
them back by raw SQL. `import_banks_dir` seeds them from a `Data/Banks`-style
tree (initial load / backup restore).

## Contents
| Item | What it does |
|------|--------------|
| `models.py` | `RawFile` (managed, `rawdata_rawfile`): bank/account/filename unique, UTF-8 CSV text. |
| `services.py` | List/read/upload against `RawFile` (filename sanitize, UTF-8/header validation, 409 on dupes). |
| `api.py` | `/accounts`, `/{account}/files`, `/{account}/csv`, `/{account}/upload`. |
| `schemas.py` | Upload/response schemas. |
| `management/` | The `import_banks_dir` command. |
| `apps.py` | AppConfig with the pinned label. |
| `tests/` | Service + import-command tests. |

## Conventions & gotchas
- `db_table`/label pinned — production data, named literally in the pipeline SQL.
- `RawFile.Meta.ordering` once polluted `DISTINCT` in `list_accounts`; keep the
  explicit `.order_by()` clear in that query (regression-tested).

## See also
- [expense_tracker/](../README.md) · [management/commands/](management/commands/README.md) · [tests/](tests/README.md)
