# pipelines/expense_tracker/

## Purpose
The ExpenseTracker ETL: load each bank's source data from Postgres, parse and
categorize it into per-account staging tables, then run the dbt project to build
the bronze → silver → gold analysis tables.

## Role in OmniView
Invoked by the backend as `python -m pipelines.expense_tracker.main` (the Rebuild
button, or a shell). `main.py` is also a Jupyter-style `# %%` script for
interactive runs. It reads the managed source tables (`rawdata_rawfile`,
`budgets_budgetmapdocument`) the web layer owns, and writes the `datavault`
tables the web layer reads.

## Contents
| Item | What it does |
|------|--------------|
| `main.py` | The pipeline: load sources → stage per account → `cd dbt/` → `DBT().run_all()`. |
| `banks/` | Bank ingestion: parse CSVs + the transaction map into staged DataFrames. |
| `dbt/` | The dbt project (medallion layers, profiles, data tests). |

## Conventions & gotchas
- A rebuild **drops and recreates** everything in `datavault` from the `omniview`
  source rows — that's the whole "delete and rebuild" story.
- `main.py`'s `temp_cd("dbt")` is relative to its own package.

## See also
- [pipelines/](../README.md) · [banks/](banks/README.md) · [dbt/](dbt/README.md)
- [backend expense_tracker](../../backend/apps/expense_tracker/README.md)
