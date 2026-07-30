# backend/shell/management/

## Purpose
The Django management-command package for the shell. It exists only to hold the
`commands/` subpackage; Django discovers commands by this exact directory layout.

## Role in OmniView
Shell-level `manage.py` subcommands live here — the ones that are about the
platform (schemas, E2E bootstrap), not about any one dashboard app.

## Contents
| Item | What it does |
|------|--------------|
| `commands/` | The actual command modules. |
| `__init__.py` | Marks the package (required for command discovery). |

## Conventions & gotchas
- The `management/commands/` nesting is mandated by Django — the names are not
  arbitrary and must not change.

## See also
- [shell/](../README.md) · [commands/](commands/README.md)
