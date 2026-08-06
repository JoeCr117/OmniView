# pipelines/expense_tracker/banks/tests/

## Purpose
Unit tests for the bank parsing layer: schema detection and the conforming of each
Golden1 CSV export version to the legacy column set.

## Role in OmniView
This is the pipeline's own test tier. It does not touch Postgres, Django or the
network; it exercises pure functions over in-memory CSV text.

## Contents
| Item | What it does |
|------|--------------|
| `conftest.py` | The fixture directory, the shared fixture reader and the v2 header, in the one place every module imports them from. Only genuinely duplicated items belong here. |
| `test_golden1_schema.py` | `golden1_schema.py` alone: the `GOLDEN1_CSV_SCHEMAS` table, `sniff_header` and `detect_schema`. |
| `test_golden1_normalize.py` | `_normalize_file` over one CSV: money-column mapping, the derived `Type`, the absent `ReferenceNo.`. |
| `test_golden1_ordering.py` | The row-ordering invariant `_parse_transactions` holds, plus the stable-sort regression guard. |
| `test_golden1_accounts.py` | Whole-account parsing through `Golden1(BankSource(...))`, including v1+v2 files in one account. |

## Conventions & gotchas
- `pyproject.toml` must list `pipelines` in `testpaths` or nothing here is
  collected. It does now.
- `DJANGO_SETTINGS_MODULE` is set globally for the whole suite, so these tests
  run inside a configured Django environment. That is incidental — Django is NOT
  a dependency of the parser, and no test here may use the `django_db` marker or
  reach a database.
- Fixtures are synthetic and live outside this directory: `conftest.FIXTURES_DIR`
  points at `docs/examples/Banks/Golden1/`, the public stand-in. `Data/` is
  production financial data and must never be read by a test.
- `conftest.V2_HEADER` is spelled out literally rather than imported from
  `GOLDEN1_CSV_SCHEMAS` — sourcing it from the table under test would make the
  detection assertions agree with production code by construction.

## See also
- [banks/](../README.md) · [all_banks/](../all_banks/README.md) · [examples/](../../../../docs/examples/README.md)
