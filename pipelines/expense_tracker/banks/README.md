# pipelines/expense_tracker/banks/

## Purpose
Bank ingestion: turn a bank's source data (budget-map YAML + per-account CSVs)
into categorized, staged DataFrames ready for dbt. `Bank` is the abstract base;
each institution is a concrete subclass.

## Role in OmniView
`main.py` calls `load_bank_sources(engine)` (reads the `omniview` source tables by
raw SQL), builds a `Bank` per source via `bank_factory`, and calls
`bank.to_sql(engine)` to write per-account `stg_*` tables into `datavault` — the
dbt project's inputs.

## Contents
| Item | What it does |
|------|--------------|
| `source.py` | `BankSource` + `load_bank_sources()` — reads budget-map + CSV text from `omniview` (names tables literally). |
| `bank.py` | Abstract `Bank`: validate, parse the transaction map, string-match categorize, `to_sql`. |
| `factory.py` | `bank_factory(source)` — maps a bank name to its concrete subclass (unknown names raise). |
| `all_banks/` | Concrete `Bank` implementations (currently `Golden1`), plus each bank's CSV-schema declaration table where its export format has more than one version. |

## Conventions & gotchas
- `source.py` names `rawdata_rawfile` / `budgets_budgetmapdocument` literally via
  the `RAW_FILE_TABLE` / `BUDGET_MAP_TABLE` constants — the schema contract test
  checks these against the Django models.
- Adding a bank = a subclass in `all_banks/` + a case in `factory.py` + dbt models
  — plus, if the bank has emitted more than one export layout, a schema
  declaration table beside the subclass (`golden1_schema.py` is the example).
- Columns are lowercased at staging so dbt can use unquoted identifiers.

## See also
- [expense_tracker/](../README.md) · [all_banks/](all_banks/README.md) · [dbt/](../dbt/README.md)
