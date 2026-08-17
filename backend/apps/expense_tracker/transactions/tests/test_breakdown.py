"""
The Breakdown feed: the endpoint the Breakdown page pivots client-side.

Its contract is narrow but load-bearing - name resolution, nothing dropped, and
the sign convention every spend visual is drawn from.
"""

import pytest

pytestmark = pytest.mark.django_db(databases=['default', 'datavault'])

URL = '/api/expense-tracker/transactions/breakdown'

EXPENSE_CATEGORIES = {'Car'}


def rows_from(client, query: str = '') -> list[dict]:
    response = client.get(f'{URL}{query}')
    assert response.status_code == 200
    return response.json()


def test_resolves_category_and_subcategory_names(client, datavault_tables):
    rows = rows_from(client)
    fuel = next(row for row in rows if row['label'] == 'Gas' and row['date_sk'] == 20240101)
    assert fuel['category'] == 'Car'
    assert fuel['sub_category'] == 'Fuel'
    assert fuel['account_type'] == 'CreditCard'
    assert fuel['amount'] == -12.50
    assert fuel['calendar_date'] == '2024-01-01'


def test_rows_with_no_category_become_the_uncategorized_bucket(client, datavault_tables):
    rows = rows_from(client)
    orphan = next(row for row in rows if row['date_sk'] == 20240103 and row['amount'] == -4.50)
    assert orphan['category'] == 'Uncategorized'
    assert orphan['sub_category'] == 'Uncategorized'
    assert orphan['label'] == 'Uncategorized'


def test_nothing_is_dropped_so_the_total_ties_to_the_seed(client, datavault_tables):
    """A bucketed uncategorized row is the difference between a report that
    balances and one that quietly loses money."""
    rows = rows_from(client)
    assert len(rows) == 6
    assert round(sum(row['amount'] for row in rows), 2) == 1093.00


def test_windows_by_calendar_date(client, datavault_tables):
    rows = rows_from(client, '?start=2024-01-03&end=2024-01-03')
    assert {row['date_sk'] for row in rows} == {20240103}
    assert len(rows) == 2


def test_expenses_are_negative_on_every_account_type(client, datavault_tables):
    """The tripwire.

    `silver_Golden1_CreditCard` negates its amounts and the three deposit
    accounts do not, so the two only agree because the real Golden1 exports
    carry opposite Debit signs. The synthetic CSVs under docs/examples do not,
    and seeding from those would flip every deposit-account expense positive -
    the waterfall would read as income and the pie would lose the category.
    Asserted per account type, because a mixed convention is the failure mode.
    """
    rows = rows_from(client)
    spend = [row for row in rows if row['category'] in EXPENSE_CATEGORIES]
    assert {row['account_type'] for row in spend} == {'CreditCard', 'FreeChecking'}
    for row in spend:
        assert row['amount'] < 0, f'{row["account_type"]} expense is not negative: {row}'

    income = [row for row in rows if row['category'] == 'Income']
    assert income and all(row['amount'] > 0 for row in income)
