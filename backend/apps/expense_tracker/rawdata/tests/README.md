# backend/apps/expense_tracker/rawdata/tests/

## Purpose
Tests for raw-CSV storage/upload services and the `import_banks_dir` command.

## Role in OmniView
Covers filename sanitization, UTF-8/header validation, the duplicate-409 path,
the `DISTINCT`-ordering regression, and that the importer upserts a bank tree
correctly.

## Contents
| Item | What it does |
|------|--------------|
| `test_services.py` | Upload/list/read + validation + 409-on-duplicate. |
| `test_import_command.py` | `import_banks_dir` upsert behaviour over a fixture tree. |

## Conventions & gotchas
- Uses in-memory `RawFile` rows / fixture trees under `tests/data/`; never `Data/`.

## See also
- [rawdata/](../README.md) · [management/commands/](../management/commands/README.md)
