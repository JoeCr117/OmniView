"""ExpenseTracker's test data, and the fixtures that put it in a database.

Owned by the app, not the shell: the data here is bank CSVs and a budget map,
which mean nothing to OmniView in general. Lives under tests/ (rather than in
the app package proper) so the deploy bundle prunes it - see
deploy/databricks/build_app.py, which drops every `tests` directory.

Two consumers:
  - pytest, via backend/conftest.py, which re-exports the fixtures below so
    that tests outside this app can use them (the auth-enforcement tests need a
    real app to be denied access *to*);
  - `manage.py e2e_bootstrap`, via seed_demo_data(), which loads the same tree
    into the dedicated E2E database.

Never the real Data/ tree: that is production data.
"""

from pathlib import Path

import pytest
import yaml

DATA_DIR = Path(__file__).parent / 'data'
DATAVAULT_SCHEMA_SQL = DATA_DIR / 'datavault_schema.sql'
BANKS_DIR = DATA_DIR / 'banks'

# A small but structurally complete BudgetMap: category budget, subcategory
# budgets that fit inside it, a Budget-less category (Income-style, exempt
# from the sum rule), and a nested Type tree terminating in string lists.
VALID_BUDGET_MAP = {
    'Car': {
        'Budget': 300,
        'SubCategories': {
            'Fuel': {
                'Budget': 100,
                'Type': {'Expense': {'Gas': ['SHELL', 'CHEVRON']}},
            },
            'Insurance': {
                'Budget': 200,
                'Type': {'Expense': {'Premium': ['GEICO']}},
            },
        },
    },
    'Income': {
        'SubCategories': {
            'Paycheck': {'Type': {'Income': {'Employer': ['ACME PAYROLL']}}},
        },
    },
}

GOLDEN1_CSV = 'Date,Description,Amount\n01/03/2024,COFFEE SHOP,-4.50\n'


def _datavault_ddl() -> str:
    """The gold-table DDL, comments stripped so it can be split on ';'.

    (See the header of datavault_schema.sql for why the two readers - this and
    e2e_bootstrap - must agree on that contract.)
    """
    lines = DATAVAULT_SCHEMA_SQL.read_text(encoding='utf-8').splitlines()
    return '\n'.join(line for line in lines if not line.lstrip().startswith('--'))


def create_datavault_tables(connection) -> None:
    """Execute the gold-table DDL on `connection` (a Django connection)."""
    with connection.cursor() as cursor:
        for statement in _datavault_ddl().split(';'):
            if statement.strip():
                cursor.execute(statement)


def seed_demo_data() -> None:
    """Load the fixture bank tree into RawFile/BudgetMapDocument rows.

    Used by `manage.py e2e_bootstrap` to give the Playwright suite a real,
    disposable ExpenseTracker dataset.
    """
    from django.core.management import call_command

    call_command('import_banks_dir', str(BANKS_DIR))


@pytest.fixture
def datavault_tables():
    """Creates + seeds the gold tables in the in-memory `datavault` alias.

    The expense models are unmanaged, so migrations never create their
    tables - this executes the DDL instead. Requires
    @pytest.mark.django_db(databases=['default', 'datavault']) on the test.
    Statements run through the Django cursor one at a time (not sqlite3
    executescript, which would issue an implicit COMMIT and break
    pytest-django's rollback isolation on the shared in-memory database).
    """
    from django.db import connections

    create_datavault_tables(connections['datavault'])


@pytest.fixture
def golden1_data(db):
    """A minimal Golden1 bank as DB rows: budget map + two accounts with one
    CSV each (the model-backed successor of the old golden1_dir tmp tree)."""
    from apps.expense_tracker.budgets.models import BudgetMapDocument
    from apps.expense_tracker.rawdata.models import RawFile

    BudgetMapDocument.objects.create(
        bank='Golden1',
        yaml_text=yaml.safe_dump(VALID_BUDGET_MAP, sort_keys=False),
    )
    for account, filename in (('CreditCard', '2024.csv'), ('Savings', 'jan.csv')):
        RawFile.objects.create(
            bank='Golden1',
            account=account,
            filename=filename,
            content=GOLDEN1_CSV,
            size=len(GOLDEN1_CSV.encode()),
        )
