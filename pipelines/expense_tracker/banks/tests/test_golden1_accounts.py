"""Whole-account parsing through `Golden1(BankSource(...))`.

Covers the four things a single-file test can't: v1+v2 concat happening
BEFORE column collisions can leak, descending-file row placement,
the `_map_categories` merge not producing suffixed `Category_x`/`Category_y`
duplicates, and the CreditCard balance anchor being stable when rows
dated after it are appended.

Single-file normalization is `test_golden1_normalize.py`. The row-ordering
invariant itself, and its stable-sort regression guard, are
`test_golden1_ordering.py` - this module imports `assert_ordering_invariant`
and `CHRONOLOGICAL_ORDER_BY_ACCOUNT` from there rather than re-deriving them.

Fixtures under `docs/examples/Banks/Golden1/` are the synthetic public
stand-in for `Data/` (real, git-ignored bank exports) - never read `Data/`
from a test. Inline CSV strings below invent their own merchants/amounts for
the same reason: this repository is public.
"""

import pandas as pd
import pytest

from pipelines.expense_tracker.banks.all_banks import golden1 as golden1_module
from pipelines.expense_tracker.banks.all_banks.golden1 import Golden1
from pipelines.expense_tracker.banks.all_banks.golden1_schema import (
    UnknownCsvSchemaError,
)
from pipelines.expense_tracker.banks.source import BankSource

from .conftest import FIXTURES_DIR, _fixture_text
from .test_golden1_ordering import (
    CHRONOLOGICAL_ORDER_BY_ACCOUNT,
    _bare_account_frame,
    assert_ordering_invariant,
)

#: The real budget map, reused for every full `Golden1(...)` construction in
#: this module so `_map_categories` runs against real category data.
BUDGET_MAP_YAML = (FIXTURES_DIR / 'BudgetMap.yml').read_text(encoding='utf-8-sig')

#: `LEGACY_COLUMNS` plus the two columns `_parse_transactions` derives
#: (`DateSK`, `SourceSchema`) and the one `Bank._parse_transactions` adds
#: (`AccountType`), in the exact order `_parse_transactions` returns them.
EXPECTED_PARSED_COLUMNS = [
    'Indx',
    'DateSK',
    'Date',
    'AccountType',
    'ReferenceNo.',
    'Type',
    'Description',
    'Debit',
    'Credit',
    'CheckNumber',
    'Balance',
    'SourceSchema',
]

#: Golden1 v2 column names that must never survive into a parsed frame,
#: whatever case they're compared in.
_DROPPED_V2_COLUMN_NAMES = {'daily balance', 'account type', 'category', 'account', 'check #'}


def _account_row_count(account: str, filename: str) -> int:
    return len(_fixture_text(account, filename).strip().splitlines()) - 1


class TestMixedVersionAccountRowCounts:
    """Basic sanity guard: a full account's row count is exactly the sum of
    its files' row counts, one file legacy (v1) and one file new (v2).
    """

    @pytest.mark.parametrize('account', sorted(CHRONOLOGICAL_ORDER_BY_ACCOUNT))
    def test_full_account_row_count_equals_sum_of_both_files(self, account):
        bank = Golden1(
            BankSource(
                name='Golden1',
                budget_map_yaml=BUDGET_MAP_YAML,
                accounts={
                    account: [
                        ('2024.csv', _fixture_text(account, '2024.csv')),
                        ('2026.csv', _fixture_text(account, '2026.csv')),
                    ]
                },
            )
        )
        expected = _account_row_count(account, '2024.csv') + _account_row_count(account, '2026.csv')
        assert len(bank.account_data[account]) == expected


class TestNormalizeBeforeConcat:
    """Each file must be conformed to `LEGACY_COLUMNS` BEFORE the
    per-account concat. The original bug concatenated first, producing the
    UNION of v1's and v2's raw columns - 'Daily Balance' next to 'Balance',
    half of it null - instead of one shared `Balance` column.
    """

    V1_TEXT = (
        'Date,ReferenceNo.,Type,Description,Debit,Credit,CheckNumber,Balance\n'
        '01/02/2024,9000000001,DEPOSIT,LEGACY DEPOSIT,,50.00,,50.00\n'
        '01/03/2024,9000000002,PURCHASE,LEGACY PURCHASE,-10.00,,,40.00\n'
    )
    V2_TEXT = (
        'Date,Account,Account Type,Description,Check #,Category,Credit,Debit,Daily Balance\n'
        '02/02/2024,xxxx1111,Checking,NEW PURCHASE,,,,-20.00,20.00\n'
        '02/01/2024,xxxx1111,Checking,NEW DEPOSIT,,,30.00,,50.00\n'
    )

    def _source(self) -> BankSource:
        return BankSource(
            name='Golden1',
            budget_map_yaml=BUDGET_MAP_YAML,
            accounts={'Checking': [('2024.csv', self.V1_TEXT), ('2026.csv', self.V2_TEXT)]},
        )

    def test_bare_parsed_frame_has_exactly_the_legacy_columns(self):
        df = _bare_account_frame(self._source(), 'Checking')
        assert list(df.columns) == EXPECTED_PARSED_COLUMNS

    def test_full_bank_construction_adds_only_category_sk_and_label_on_top(self):
        bank = Golden1(self._source())
        df = bank.account_data['Checking']
        assert set(EXPECTED_PARSED_COLUMNS) <= set(df.columns)
        assert set(df.columns) - set(EXPECTED_PARSED_COLUMNS) <= {
            'CategorySK',
            'Label',
            'Category',
            'CategoryBudget',
            'SubCategory',
            'SubCategoryBudget',
        }

    def test_no_v2_source_only_column_name_survives(self):
        df = _bare_account_frame(self._source(), 'Checking')
        lowered = {name.casefold() for name in df.columns}
        assert not (lowered & _DROPPED_V2_COLUMN_NAMES)

    def test_balance_has_zero_nulls(self):
        """The original bug produced a half-NaN union of `Balance` and
        `Daily Balance`: every v1 row's `Daily Balance` cell was NULL, and
        every v2 row's `Balance` cell was NULL.
        """
        df = _bare_account_frame(self._source(), 'Checking')
        assert df['Balance'].isna().sum() == 0

    def test_both_schema_versions_are_present_in_the_one_frame(self):
        df = _bare_account_frame(self._source(), 'Checking')
        assert set(df['SourceSchema'].unique()) == {'golden1.v1', 'golden1.v2'}


class TestDescendingRowPlacement:
    """`CreditCard/2026.csv` is a v2 (newest-first) file. Its 07/12/2026
    date carries 3 transactions - the fixture this test is written against."""

    @pytest.fixture
    def bank(self):
        return Golden1(
            BankSource(
                name='Golden1',
                budget_map_yaml=BUDGET_MAP_YAML,
                accounts={
                    'CreditCard': [
                        ('2024.csv', _fixture_text('CreditCard', '2024.csv')),
                        ('2026.csv', _fixture_text('CreditCard', '2026.csv')),
                    ]
                },
            )
        )

    def test_date_sk_is_monotonically_increasing(self, bank):
        df = bank.account_data['CreditCard']
        assert df['DateSK'].is_monotonic_increasing

    def test_first_row_in_a_descending_file_gets_the_greatest_indx_that_date(self, bank):
        """`ROUNDHOUSE PIZZA #7` is the FIRST of the three 07/12/2026 rows in
        `CreditCard/2026.csv`'s (newest-first) file order. Since the whole
        file is reversed to become oldest-first, it must land LAST among
        that date's rows - i.e. hold the greatest `Indx` of the three.
        """
        df = bank.account_data['CreditCard']
        same_day = df[df['DateSK'] == 20260712]
        assert len(same_day) == 3
        last_row = same_day.loc[same_day['Indx'].idxmax()]
        assert last_row['Description'] == 'ROUNDHOUSE PIZZA #7'

    def test_ordering_invariant_holds_on_the_fully_mapped_frame(self, bank):
        """Same six-part invariant as `test_golden1_ordering.py`, but
        exercised through full `Golden1(...)` construction (post
        `_map_categories`) rather than the bare `_parse_transactions` call -
        proving the category merge doesn't disturb row order either.
        """
        df = bank.account_data['CreditCard']
        assert_ordering_invariant(
            df,
            file_blocks=CHRONOLOGICAL_ORDER_BY_ACCOUNT['CreditCard'],
            check_balance_continuity=True,
        )

    def test_file_blocks_never_interleave_and_stay_in_filename_order(self, bank):
        df = bank.account_data['CreditCard']
        blocks = [df['SourceSchema'].iloc[0]]
        for schema in df['SourceSchema']:
            if schema != blocks[-1]:
                blocks.append(schema)
        assert blocks == ['golden1.v1', 'golden1.v2']


class TestCategoryColumnCollision:
    """`_map_categories` merges the parsed frame against
    `transaction_map`, which itself carries a `Category` column (see
    `Bank._parse_transaction_map`). A v2 file's own `Category` column is
    already dropped during `_normalize_file` (LEGACY_COLUMNS has no
    `Category` entry - see `TestNormalizeBeforeConcat` above), and that drop
    is exactly what keeps this merge from colliding: an un-dropped v2
    `Category` column would give pandas two `Category` columns to merge
    against one, producing suffixed `Category_x`/`Category_y` duplicates
    that bronze's explicit column-by-name projection would silently hide
    rather than surface.
    """

    def test_no_suffixed_category_pair_in_any_staged_frame(self):
        bank = Golden1(
            BankSource(
                name='Golden1',
                budget_map_yaml=BUDGET_MAP_YAML,
                accounts={
                    'CreditCard': [
                        ('2024.csv', _fixture_text('CreditCard', '2024.csv')),
                        ('2026.csv', _fixture_text('CreditCard', '2026.csv')),
                    ]
                },
            )
        )
        for table_name, frame in bank.account_data.items():
            columns = list(frame.columns)
            assert 'Category_x' not in columns, f'{table_name} has a suffixed Category_x column'
            assert 'Category_y' not in columns, f'{table_name} has a suffixed Category_y column'
            category_columns = [col for col in columns if col == 'Category']
            assert len(category_columns) <= 1, (
                f'{table_name} has {len(category_columns)} columns literally named '
                f"'Category': {category_columns}"
            )


def _account_frame(account: str, filenames: tuple[str, ...]) -> pd.DataFrame:
    """One account parsed from exactly `filenames`, in the order given."""
    bank = Golden1(
        BankSource(
            name='Golden1',
            budget_map_yaml=BUDGET_MAP_YAML,
            accounts={
                account: [(name, _fixture_text(account, name)) for name in filenames],
            },
        )
    )
    return bank.account_data[account]


class TestAppendingALaterFileDoesNotMoveEarlierBalances:
    """Next year's export cannot rewrite this year's reported balances.

    `_fill_missing_balances` anchors each empty balance to the NEAREST STATED
    one, preferring the next over the previous. That preference is what makes
    this hold: a row whose own file states a balance at or after it is already
    anchored inside that file, so appending a later file adds nothing nearer
    and changes nothing.

    This is the invariant that lets the parser's hard-coded anchor be deleted.
    The constant used to buy stability by naming one date and one hand-verified
    figure, which had to be re-verified by hand whenever the history was
    re-exported; the anchor is now read out of the export, and stability comes
    from where it is read rather than from it never moving.
    """

    def test_a_deposit_accounts_stated_balances_survive_a_later_file(self):
        """The strong case: v1 states a balance on every row, so every one of
        them is copied through and none can move, whatever is appended.
        """
        v1_only = _account_frame('FreeChecking', ('2024.csv',))
        v1_plus_v2 = _account_frame('FreeChecking', ('2024.csv', '2026.csv'))

        pre_2026 = v1_plus_v2.iloc[: len(v1_only)]
        assert (pre_2026['DateSK'] < 20260101).all()
        assert v1_only['Balance'].tolist() == pre_2026['Balance'].tolist()

    def test_a_reconstructed_balance_is_continuous_across_the_file_boundary(self):
        """The credit card's v1 rows are reconstructed and its v2 rows stated,
        so the join between the two files is where a re-anchoring error would
        show up as a step no transaction accounts for.
        """
        frame = _account_frame('CreditCard', ('2024.csv', '2026.csv'))
        money = (frame['Debit'].fillna(0) + frame['Credit'].fillna(0)).round(2)
        steps = frame['Balance'].diff().iloc[1:].round(2)

        assert (steps - money.iloc[1:]).abs().max() < 0.005


class TestAnAccountThatStatesNoBalanceAtAll:
    """v1's credit card exports a literal zero on every row.

    `_to_canonical_signs` turns those into NULL, so an account holding only v1
    card files has no absolute reference anywhere. Its balances are then a
    running total from zero - correct relative to each other, arbitrary in
    absolute terms - and the parser says so on stdout rather than presenting a
    number it cannot source.
    """

    def test_balances_are_a_relative_running_total_and_the_reader_is_told(self, capsys):
        frame = _account_frame('CreditCard', ('2024.csv',))
        money = (frame['Debit'].fillna(0) + frame['Credit'].fillna(0)).round(2)

        assert frame['Balance'].tolist() == money.cumsum().round(2).tolist()
        assert 'no balance is stated' in capsys.readouterr().out


class TestRejectUndeclaredSchemasRunsBeforeAnyFrameIsBuilt:
    """`_reject_undeclared_schemas` does a header-only pass over every file
    in an account before any file is normalized into a frame. Proven here by
    spying on `_normalize_file`: if the header check instead ran lazily,
    file by file, the first (good) file would already have been normalized
    into a frame - and then discarded - by the time the second (bad) file's
    header failed.
    """

    def test_second_files_undeclared_header_fails_before_normalize_file_runs(self, monkeypatch):
        good_v1_text = (
            'Date,ReferenceNo.,Type,Description,Debit,Credit,CheckNumber,Balance\n'
            '01/02/2024,1,DEPOSIT,Invented Good Row,,10.00,,10.00\n'
        )
        bad_text = 'Date,Nonsense\n01/01/2024,whatever\n'

        calls: list[str] = []
        original_normalize_file = golden1_module._normalize_file

        def spy(csv_text, *, account, where):
            calls.append(where)
            return original_normalize_file(csv_text, account=account, where=where)

        monkeypatch.setattr(golden1_module, '_normalize_file', spy)

        bank_source = BankSource(
            name='Golden1',
            budget_map_yaml=BUDGET_MAP_YAML,
            accounts={
                'Checking': [
                    ('2024.csv', good_v1_text),
                    ('2026.csv', bad_text),
                ]
            },
        )

        with pytest.raises(UnknownCsvSchemaError) as exc_info:
            Golden1(bank_source)

        assert calls == []
        assert 'Golden1/Checking/2026.csv' in str(exc_info.value)
