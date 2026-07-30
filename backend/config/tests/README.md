# backend/config/tests/

## Purpose
Project-wide tests that don't belong to any single app: the schema/label
contract the pipeline depends on, API prefixing, cross-app auth enforcement, the
static-export view, request logging, and per-folder README coverage.

## Role in OmniView
These are the tripwires that keep the structural guarantees honest. If a package
move silently renames a production table, or an app's API stops being gated, or
a new folder ships without a README, a test here fails.

## Contents
| Item | What it does |
|------|--------------|
| `test_schema_contract.py` | Asserts app labels + `db_table`s + the pipeline's table-name constants all still agree. |
| `test_api_prefixes.py` | Pins `/api/expense-tracker/*` (and that old top-level paths 404); covers rebuild-status. |
| `test_auth_enforcement.py` | The API-is-the-boundary matrix (401 unauthenticated, 403 unentitled). |
| `test_frontend_view.py` | The export server + legacy redirects + the non-staff admin-page 404. |
| `test_request_log_middleware.py` | Request-ID minting + `omniview.request` duration logging. |
| `test_readme_coverage.py` | QOL6: every source folder has a standard README (this file's guarantee). |

## Conventions & gotchas
- Run under `config.settings.test` (SQLite in-memory).
- `test_schema_contract.py` is load-bearing — do not weaken it to make a rename
  pass; fix the rename instead.

## See also
- [config/](../README.md) · [shell/tests/](../../shell/tests/README.md)
