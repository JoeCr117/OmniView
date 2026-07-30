# %%
"""ExpenseTracker's ETL: bank CSVs in Postgres -> staged tables -> dbt build.

Run from the repo root (so `pipelines` is importable), either as a module

    uv run python -m pipelines.expense_tracker.main

or cell-by-cell in an interactive window - the `# %%` markers are deliberate.
The web app invokes this as a subprocess when you press Rebuild; see
backend/shell/pipeline.py.
"""
from pathlib import Path

from sqlalchemy import text

from pipelines.common import temp_cd, timed
from pipelines.common.postgres import DATAVAULT_SCHEMA, pg_engine
from pipelines.common.pydbt import DBT
from pipelines.expense_tracker.banks import Bank, bank_factory, load_bank_sources

# The dbt project ships next to this module, so anchor to the file rather than
# the cwd: `python -m` runs with the repo root as the working directory.
DBT_PROJECT = Path(__file__).resolve().parent / 'dbt'


# %%
@timed
def main(serve_docs: bool = False):
    """
    Main function to load bank source data from Postgres, parse/stage it, and run dbt build.
    Args:
        serve_docs (bool): If True, serves the dbt documentation.
    """

    engine = pg_engine()
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{DATAVAULT_SCHEMA}"'))

    # Source data (budget-map YAML + raw CSV text) lives in the omniview
    # schema, written by the web app (uploads/edits) or the one-time
    # `manage.py import_banks_dir` loader.
    sources = load_bank_sources(engine)
    if not sources:
        raise RuntimeError(
            'No bank source data found in the database - run '
            '`manage.py import_banks_dir <path>` or upload CSVs + a budget '
            'map through the app first.'
        )

    # Build the Banks and stage them into the datavault schema. dbt rebuilds
    # every model from the stg_* tables, so replacing them per run is the
    # whole "delete and rebuild" story; the omniview schema (Django auth/
    # sessions/source data) is never touched.
    bank_dict: dict[str, Bank] = {}
    for source in sources:
        bank = bank_factory(source)
        bank_dict[bank.name] = bank
    for bank in bank_dict.values():
        bank.to_sql(engine)
    engine.dispose()

    # Move into the dbt directory temporarily and run the dbt commands
    log_file = DBT_PROJECT / 'logs' / 'dbt.log'
    if log_file.exists() and log_file.is_file():
        log_file.unlink()

    dbt = DBT()
    with temp_cd(DBT_PROJECT):
        dbt.run_all(docs_generate=serve_docs, docs_serve=serve_docs)


# %%
if __name__ == "__main__":
    main(serve_docs=False)
# %%
