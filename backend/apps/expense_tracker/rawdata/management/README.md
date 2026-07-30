# backend/apps/expense_tracker/rawdata/management/

## Purpose
The Django management-command package for the rawdata app. Exists to hold the
`commands/` subpackage in the layout Django's command discovery requires.

## Role in OmniView
Houses `import_banks_dir`, the loader that gets bank source data into the DB.

## Contents
| Item | What it does |
|------|--------------|
| `commands/` | The command modules. |
| `__init__.py` | Marks the package (required for discovery). |

## Conventions & gotchas
- The `management/commands/` nesting is Django-mandated; don't rename it.

## See also
- [rawdata/](../README.md) · [commands/](commands/README.md)
