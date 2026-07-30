"""
import_banks_dir walks a Data/Banks-style tree into RawFile +
BudgetMapDocument rows. Trees are built in tmp_path - the command is the one
remaining place the filesystem layout matters.
"""

import pytest
import yaml
from django.core.management import CommandError, call_command

from apps.expense_tracker.budgets.models import BudgetMapDocument
from apps.expense_tracker.tests.fixtures import GOLDEN1_CSV, VALID_BUDGET_MAP
from apps.expense_tracker.rawdata.models import RawFile

pytestmark = pytest.mark.django_db


@pytest.fixture
def banks_tree(tmp_path):
    """A minimal Golden1 tree: BudgetMap.yml + two accounts with one CSV each."""
    bank = tmp_path / 'Banks' / 'Golden1'
    for account in ('CreditCard', 'Savings'):
        (bank / account).mkdir(parents=True)
    # newline='' so Windows doesn't translate \n -> \r\n and the stored
    # content compares byte-for-byte against GOLDEN1_CSV.
    (bank / 'CreditCard' / '2024.csv').write_text(GOLDEN1_CSV, encoding='utf-8', newline='')
    (bank / 'Savings' / 'jan.csv').write_text(GOLDEN1_CSV, encoding='utf-8', newline='')
    (bank / 'BudgetMap.yml').write_text(
        yaml.safe_dump(VALID_BUDGET_MAP, sort_keys=False), encoding='utf-8'
    )
    return tmp_path / 'Banks'


def test_imports_budget_map_and_csvs(banks_tree):
    call_command('import_banks_dir', str(banks_tree))

    document = BudgetMapDocument.objects.get(bank='Golden1')
    assert yaml.safe_load(document.yaml_text) == VALID_BUDGET_MAP

    rows = RawFile.objects.filter(bank='Golden1').order_by('account')
    assert [(r.account, r.filename, r.content) for r in rows] == [
        ('CreditCard', '2024.csv', GOLDEN1_CSV),
        ('Savings', 'jan.csv', GOLDEN1_CSV),
    ]
    assert all(r.size == len(GOLDEN1_CSV.encode()) for r in rows)


def test_rerun_updates_instead_of_duplicating(banks_tree):
    call_command('import_banks_dir', str(banks_tree))
    (banks_tree / 'Golden1' / 'CreditCard' / '2024.csv').write_text(
        'Date,Description,Amount\n01/04/2024,BAKERY,-3.00\n', encoding='utf-8'
    )
    call_command('import_banks_dir', str(banks_tree))

    assert RawFile.objects.filter(bank='Golden1').count() == 2
    row = RawFile.objects.get(bank='Golden1', account='CreditCard', filename='2024.csv')
    assert 'BAKERY' in row.content
    assert BudgetMapDocument.objects.filter(bank='Golden1').count() == 1


def test_missing_directory_errors(tmp_path):
    with pytest.raises(CommandError, match='is not a directory'):
        call_command('import_banks_dir', str(tmp_path / 'nope'))


def test_bank_without_budget_map_errors(banks_tree):
    (banks_tree / 'Golden1' / 'BudgetMap.yml').unlink()
    with pytest.raises(CommandError, match='exactly one root .yml'):
        call_command('import_banks_dir', str(banks_tree))
