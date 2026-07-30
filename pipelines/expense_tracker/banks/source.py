"""
Pipeline input layer: bank source data (budget-map YAML + raw CSV text) read
from the deployment's Postgres database instead of the filesystem.

The rows are written by the Django side (rawdata.RawFile and
budgets.BudgetMapDocument in the omniview schema). A pipeline is not a Django
process, so this reads them with plain SQLAlchemy - which means the table names
below are a hand-maintained contract with the ORM rather than something Django
can keep in step for us. Both models pin their `db_table` to exactly these
strings, and backend/config/tests/test_schema_contract.py asserts the two sides
still agree.
"""

__all__ = ['BankSource', 'load_bank_sources', 'BUDGET_MAP_TABLE', 'RAW_FILE_TABLE']

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.engine import Engine

from pipelines.common.postgres import OMNIVIEW_SCHEMA

BUDGET_MAP_TABLE = 'budgets_budgetmapdocument'
RAW_FILE_TABLE = 'rawdata_rawfile'


@dataclass
class BankSource:
    name: str
    budget_map_yaml: str
    # account name -> [(filename, csv_text)], filename-sorted (matches the
    # alphabetical order the old per-directory glob produced, which matters
    # for intraday balance ordering within a date).
    accounts: dict[str, list[tuple[str, str]]]


def load_bank_sources(engine: Engine) -> list[BankSource]:
    """One BankSource per stored budget map, with that bank's CSVs attached."""
    with engine.connect() as conn:
        budget_maps = conn.execute(text(
            f'SELECT bank, yaml_text FROM "{OMNIVIEW_SCHEMA}".{BUDGET_MAP_TABLE} '
            'ORDER BY bank'
        )).all()
        raw_files = conn.execute(text(
            f'SELECT bank, account, filename, content '
            f'FROM "{OMNIVIEW_SCHEMA}".{RAW_FILE_TABLE} '
            'ORDER BY bank, account, filename'
        )).all()

    files_by_bank: dict[str, dict[str, list[tuple[str, str]]]] = {}
    for bank, account, filename, content in raw_files:
        files_by_bank.setdefault(bank, {}).setdefault(account, []).append((filename, content))

    return [
        BankSource(name=bank, budget_map_yaml=yaml_text, accounts=files_by_bank.get(bank, {}))
        for bank, yaml_text in budget_maps
    ]
