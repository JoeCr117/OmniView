"""The row-ordering invariant `_parse_transactions` must hold, and its
stable-sort regression guard.

Every account's parsed frame is required to satisfy six things at once (see
`assert_ordering_invariant` below): a contiguous 0-based `Indx`, a
non-decreasing `DateSK`, same-date ties within one file kept in that file's
own chronological order, no interleaving between files, each day's
MAX(Indx) row being that day's last transaction, and - for CreditCard only -
a running `Balance` that tracks cumulative Debit+Credit exactly.

`TestNonStableSortRegressionGuard` pins the bug this parser was just fixed
for: `_fix_intraday_balance` sorting with `kind='stable'` instead of the
pandas default `kind='quicksort'`, which is not stable and silently
reorders rows that share a date.

Single-file normalization lives in `test_golden1_normalize.py`; whole-account
parsing through a full `Golden1(BankSource(...))`, including the v1/v2
column-collision and balance-anchor cases, lives in
`test_golden1_accounts.py`. Both import `assert_ordering_invariant` and
`CHRONOLOGICAL_ORDER_BY_ACCOUNT` from here rather than re-deriving them.

Fixtures under `docs/examples/Banks/Golden1/` are the synthetic public
stand-in for `Data/` (real, git-ignored bank exports) - never read `Data/`
from a test. The large inline fixture below invents its own merchants and
amounts for the same reason: this repository is public.
"""

import pandas as pd
import pytest

from pipelines.expense_tracker.banks.all_banks.golden1 import Golden1
from pipelines.expense_tracker.banks.source import BankSource

from .conftest import _fixture_text

#: `_bare_account_frame` never reads this - `Bank.__init__` is bypassed
#: entirely - but `BankSource` requires a non-empty string.
_UNUSED_BUDGET_MAP_YAML = 'unused: {}\n'


def _bare_account_frame(source: BankSource, account_name: str) -> pd.DataFrame:
    """`Golden1._parse_transactions()`'s output for one account, bypassing
    `Bank.__init__` (budget-map parsing and the category merge) so the
    ordering invariant is tested in isolation from category mapping. The v1/
    v2 `Category` column collision that merge can produce is
    `test_golden1_accounts.py`'s `TestCategoryColumnCollision`, not this
    module's concern.
    """
    bank = object.__new__(Golden1)
    bank.source = source
    bank.name = source.name
    return bank._parse_transactions()[account_name]


def real_fixture_source(account_name: str) -> BankSource:
    """A `BankSource` for one real account, its 2024 (v1) and 2026 (v2)
    files in filename order - the same shape `load_bank_sources` produces.
    """
    return BankSource(
        name='Golden1',
        budget_map_yaml=_UNUSED_BUDGET_MAP_YAML,
        accounts={account_name: [
            ('2024.csv', _fixture_text(account_name, '2024.csv')),
            ('2026.csv', _fixture_text(account_name, '2026.csv')),
        ]},
    )


def assert_ordering_invariant(
    df: pd.DataFrame,
    *,
    file_blocks: list[tuple[str, list[str]]],
    check_balance_continuity: bool = False,
    balance_tolerance: float = 0.005,
) -> None:
    """Assert the full row-ordering invariant for one account's parsed frame.

    Args:
        df: The frame `_parse_transactions` (or a full `Golden1(...)`
            account) returned for one account.
        file_blocks: One `(SourceSchema value, chronological Description
            order)` pair per source file, in the order the files must
            appear as CONTIGUOUS blocks in `df` - ascending filename order.
            "Chronological order" means that file's own rows oldest-
            transaction-first: file order for an ascending export, reversed
            file order for a descending one - exactly what `_to_oldest_first`
            guarantees.
        check_balance_continuity: CreditCard-only. If true, assert
            `Balance[k] - Balance[k-1] == round(Debit[k] + Credit[k], 2)`
            for every consecutive pair.

    Comparing the full per-block Description sequence - rather than only
    checking `DateSK` is non-decreasing - is what catches same-date ties
    losing file order, files interleaving, and a day's last transaction
    landing anywhere but that day's MAX(Indx): all three collapse into one
    exact-sequence assertion once the block boundaries are known.
    """
    assert df['Indx'].tolist() == list(range(len(df))), 'Indx is not 0-based contiguous'
    assert df['DateSK'].is_monotonic_increasing, 'DateSK is not monotonically increasing'

    offset = 0
    for schema_version, descriptions in file_blocks:
        block = df.iloc[offset:offset + len(descriptions)]
        actual_schemas = block['SourceSchema'].unique().tolist()
        assert actual_schemas == [schema_version], (
            f'expected a contiguous block of {len(descriptions)} '
            f'{schema_version!r} row(s) at position {offset}, found source '
            f'schema(s) {actual_schemas} - files are interleaved or out of '
            'filename order'
        )
        assert block['Description'].tolist() == descriptions, (
            f'{schema_version} block (rows {offset}..{offset + len(descriptions) - 1}) '
            f'is not in this file\'s chronological order.\n'
            f'expected: {descriptions}\n'
            f'actual:   {block["Description"].tolist()}'
        )
        offset += len(descriptions)

    assert offset == len(df), (
        f'file_blocks describe {offset} row(s) but the frame has {len(df)}'
    )

    if check_balance_continuity:
        money = (df['Debit'].fillna(0) + df['Credit'].fillna(0)).round(2)
        delta = df['Balance'].diff().iloc[1:].reset_index(drop=True)
        expected = money.iloc[1:].reset_index(drop=True)
        bad = (delta - expected).abs() >= balance_tolerance
        assert not bad.any(), (
            'Balance does not track cumulative Debit+Credit at row(s) '
            f'{df.index[1:].to_numpy()[bad.to_numpy()].tolist()}'
        )


#: The real fixtures' rows, each account's v1-then-v2 chronological
#: description order, hand-derived from `docs/examples/Banks/Golden1/`. v1
#: files are already oldest-first so their order is simply the file's own
#: row order; v2 files are newest-first so their order is the file reversed
#: - including reversing same-date ties, which is the part a scrambled sort
#: would get wrong.
CHRONOLOGICAL_ORDER_BY_ACCOUNT: dict[str, list[tuple[str, list[str]]]] = {
    'CreditCard': [
        ('golden1.v1', [
            'NORTHBEAM COFFEE #12', 'FUELWORKS 448', 'GREENFIELD MKT 209',
            'BLUE LANTERN SUSHI', 'AUTOMATIC PAYMENT', 'STREAMCO MONTHLY',
            'Interest Charge',
        ]),
        ('golden1.v2', [
            'Interest Charge', 'LAKEVIEW HARDWARE', 'SPARKLE WASH #3',
            'GRAND CINEMA 14', 'CEDAR AUTO REPAIR', 'NORTHBEAM COFFEE #12',
            'FUELWORKS 448', 'GREENFIELD MKT 209', 'ROUNDHOUSE PIZZA #7',
            'AUTOMATIC PAYMENT', 'BLUE LANTERN SUSHI', 'STREAMCO MONTHLY',
        ]),
    ],
    'FreeChecking': [
        ('golden1.v1', [
            'EXAMPLE EMPLOYER (PAYROLL)', 'EXAMPLE APTS', 'EXAMPLE WIRELESS',
            'EXAMPLE BROADBAND', 'to share 1', 'Withdrawal',
            'EXAMPLE EMPLOYER (PAYROLL)', 'EXAMPLE AUTO INS',
        ]),
        ('golden1.v2', [
            'ATM FEE DRAFT WITHDRAWAL Trace #7712', 'LANTERN LIGHTING CO',
            'EXAMPLE EMPLOYER (PAYROLL)', 'QUICKSTOP #221',
            'HOMESTEAD SUPPLY CO', 'EXAMPLE APTS', 'Withdrawal',
            'EXAMPLE EMPLOYER (PAYROLL)', 'EXAMPLE AUTO INS',
            'EXAMPLE WIRELESS', 'EXAMPLE BROADBAND', 'STATEMENT AVAILABLE',
        ]),
    ],
    'MoneyMarket': [
        ('golden1.v1', ["Online Transfer 'STD'", 'Mobile Deposit', 'EXAMPLE BROKERAGE']),
        ('golden1.v2', [
            "Online Transfer 'STD'", 'Mobile Deposit', 'EXAMPLE BROKERAGE',
            "Online Transfer 'STD'", 'Mobile Deposit', 'EXAMPLE BROKERAGE',
        ]),
    ],
    'Savings': [
        ('golden1.v1', ['from share 1', 'Checking Deposit', 'to share 0']),
        ('golden1.v2', [
            'Checking Deposit', 'to share 0', 'from share 1',
            'Checking Deposit', 'to share 0',
        ]),
    ],
}


class TestOrderingInvariantAcrossRealFixtures:
    @pytest.mark.parametrize('account', sorted(CHRONOLOGICAL_ORDER_BY_ACCOUNT))
    def test_full_v1_plus_v2_account_satisfies_the_ordering_invariant(self, account):
        df = _bare_account_frame(real_fixture_source(account), account)
        assert_ordering_invariant(
            df,
            file_blocks=CHRONOLOGICAL_ORDER_BY_ACCOUNT[account],
            check_balance_continuity=(account == 'CreditCard'),
        )


#: > 16 rows on purpose. numpy's introspective sort (pandas' default
#: `kind='quicksort'`) falls back to insertion sort - incidentally stable -
#: below a small element-count threshold, so a fixture at or under 16 rows
#: would still pass `_fix_intraday_balance`'s stable-sort contract even if a
#: future edit silently dropped `kind='stable'`. Do not shrink this fixture
#: to "simplify" the test; a smaller one stops testing anything.
_R3_DATES = ('01/02/2024', '01/03/2024', '01/04/2024', '01/05/2024')
_R3_ROWS_PER_DATE = 6


def _build_large_single_file_creditcard_csv() -> tuple[str, list[str]]:
    """A 24-row, single-file, ascending Golden1 v1 CreditCard export with a
    6-row tie group on each of 4 dates and a pairwise-distinct Debit on
    every row, so a scrambled tie order is distinguishable from the correct
    one by Description alone.
    """
    header = 'Date,ReferenceNo.,Type,Description,Debit,Credit,CheckNumber,Balance'
    lines = [header]
    descriptions = []
    reference = 5_000_000_001
    for date_index, date in enumerate(_R3_DATES):
        for row_index in range(_R3_ROWS_PER_DATE):
            n = date_index * _R3_ROWS_PER_DATE + row_index
            description = f'EXAMPLE MERCHANT {n:02d}'
            debit = -round(1.01 * (n + 1), 2)
            lines.append(','.join([
                date, str(reference), 'PURCHASE', description,
                f'{debit:.2f}', '', '', '',
            ]))
            descriptions.append(description)
            reference += 1
    return '\n'.join(lines) + '\n', descriptions


class TestNonStableSortRegressionGuard:
    def test_intraday_ties_keep_file_order_across_a_24_row_fixture(self):
        """REGRESSION GUARD: `_fix_intraday_balance` sorts with
        `kind='stable'`. The pandas/numpy default, `kind='quicksort'`, is
        NOT stable and may permute rows that share a `Date` - exactly the
        ties this fixture is built to have plenty of. See the module-level
        comment above `_R3_DATES` for why this fixture must stay > 16 rows.
        """
        csv_text, descriptions = _build_large_single_file_creditcard_csv()
        source = BankSource(
            name='Golden1',
            budget_map_yaml=_UNUSED_BUDGET_MAP_YAML,
            accounts={'CreditCard': [('big.csv', csv_text)]},
        )
        df = _bare_account_frame(source, 'CreditCard')

        assert len(df) > 16
        assert_ordering_invariant(
            df,
            file_blocks=[('golden1.v1', descriptions)],
            check_balance_continuity=True,
        )
