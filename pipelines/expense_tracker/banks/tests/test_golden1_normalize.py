"""Single-file normalization: `_normalize_file` against one Golden1 CSV.

Covers the money-column mapping, the derived `Type` and `ReferenceNo.`
columns, date parsing and the per-file row reversal. Account-level concat,
`Indx` assignment and cross-file ordering belong to
`test_golden1_ordering.py` / `test_golden1_accounts.py`, not here.

Fixtures under `docs/examples/Banks/Golden1/` are the synthetic public
stand-in for `Data/` (real, git-ignored bank exports) - never read `Data/`
from a test. Inline CSV strings below invent their own merchants/amounts for
the same reason: this repository is public.
"""

import re

import numpy as np
import pandas as pd
import pytest

from pipelines.expense_tracker.banks.all_banks.golden1 import (
    AmbiguousTransactionDirectionError,
    _normalize_file,
    _to_oldest_first,
)
from pipelines.expense_tracker.banks.all_banks.golden1_schema import (
    LEGACY_COLUMNS,
    Golden1CsvSchema,
)

from .conftest import V2_HEADER_LINE, _fixture_text
from .test_golden1_ordering import _bare_account_frame, real_fixture_source


def _v2_row(date: str, description: str, *, credit: str = '', debit: str = '') -> str:
    return f'{date},xxxx0000,Checking,{description},,,{credit},{debit},100.00\n'


ALL_2026_FIXTURES = ('CreditCard', 'FreeChecking', 'MoneyMarket', 'Savings')


def _normalized(csv_text: str, *, account: str = 'FreeChecking', where: str = 'test'):
    """`_normalize_file` with the account defaulted, for the tests it does not concern.

    `account` selects the file's sign convention, so `_normalize_file` requires
    it. Almost nothing in this module is about that: these tests cover column
    mapping, date parsing and row order, and would carry the same literal
    account on twenty-odd call sites for no reader benefit. The default is a
    deposit account, which is `DEFAULT_CONVENTION` - money and balance pass
    through untouched, so nothing here is reading a normalized number and
    believing it is the source's.

    The sign convention itself is `test_golden1_sign_convention.py`, which
    calls the real entry point and names its accounts.
    """
    return _normalize_file(csv_text, account=account, where=where)


class TestMoneyColumnMapping:
    def test_v2_debit_and_credit_read_by_name_not_position(self):
        """v2 exports Credit before Debit; v1 exports the reverse. A
        positional read would swap every sign here while a shape/column-count
        test still passes - so this asserts exact cell values, not just sign.
        """
        df = _normalized(_fixture_text('FreeChecking', '2026.csv'), where='test')

        payroll = df[df['Description'] == 'EXAMPLE EMPLOYER (PAYROLL)'].iloc[0]
        assert payroll['Credit'] == 2510.00
        assert pd.isna(payroll['Debit'])

        broadband = df[df['Description'] == 'EXAMPLE BROADBAND'].iloc[0]
        assert broadband['Debit'] == -82.10
        assert pd.isna(broadband['Credit'])

    @pytest.mark.parametrize('account', ALL_2026_FIXTURES)
    def test_v2_debit_never_positive_credit_never_negative(self, account):
        df = _normalized(_fixture_text(account, '2026.csv'), account=account, where='test')
        debit = df['Debit'].dropna()
        credit = df['Credit'].dropna()
        assert (debit <= 0).all()
        assert (credit >= 0).all()


class TestDerivedTypeColumn:
    def test_v2_type_holds_only_direction_never_account_kind(self):
        """v2's 'Account Type' (Checking, Credit Card) and legacy 'Type'
        (DEBIT, CREDIT) share almost no meaning - if the mapping ever
        regressed to copying one into the other, this is what would leak.
        """
        df = _normalized(_fixture_text('FreeChecking', '2026.csv'), where='test')
        types = set(df['Type'].dropna().unique())
        assert types <= {'DEBIT', 'CREDIT'}
        assert 'Checking' not in types
        assert 'Credit Card' not in types


class TestReferenceNumberRepresentation:
    """`ReferenceNo.` exists in v1 and not in v2, so it is the one column whose
    dtype is decided by the CONCAT rather than by either file: v1 contributes
    real numbers, v2 contributes `_absent_column`'s all-NaN float64, and
    pandas picks the result's dtype from both. It must come out float64, which
    `to_sql` stages as `double precision`; an object column stages as TEXT and
    bronze's ``CAST("referenceno." AS text)`` then renders every legacy value
    through `str(2000000001.0)`, growing a trailing '.0' that was never in the
    source export.
    """

    def test_a_mixed_v1_and_v2_account_keeps_reference_number_float64(self):
        """The single-file cases cannot fail - `_absent_column` hard-codes
        float64 and a v1-only file is numeric already. Only the mixed account
        can regress, and mixed is what every real account is.
        """
        df = _bare_account_frame(real_fixture_source('FreeChecking'), 'FreeChecking')
        reference = df['ReferenceNo.']

        assert set(df['SourceSchema'].unique()) == {'golden1.v1', 'golden1.v2'}
        assert reference.dtype == np.float64
        assert reference.notna().any(), 'the v1 file contributed no reference numbers'
        assert reference.isna().any(), 'the v2 file contributed no absent values'

    def test_v2_reference_number_is_all_null(self):
        """v2 declares `ReferenceNo.` absent. A value appearing here means the
        column was mapped to some v2 source column instead - most likely
        'Account', which holds a masked account number, not a reference.
        """
        df = _normalized(_fixture_text('FreeChecking', '2026.csv'), where='test')
        assert df['ReferenceNo.'].isna().all()

    def test_v1_reference_number_round_trips_without_a_trailing_dot_zero(self):
        """`ReferenceNo.` must stage as float64, not object/string: staging as
        TEXT would make bronze's `CAST("referenceno." AS text)` render every
        legacy value through `str(2000000001.0)`, growing a trailing '.0'
        that was never in the source export.
        """
        df = _normalized(_fixture_text('FreeChecking', '2024.csv'), where='test')
        non_null = df['ReferenceNo.'].dropna()
        assert len(non_null) > 0
        for value in non_null:
            as_text = str(int(value))
            assert not as_text.endswith('.0')
            assert as_text == str(int(value))


class TestTransactionDirectionEdgeCases:
    def test_both_debit_and_credit_populated_raises(self):
        csv_text = V2_HEADER_LINE + _v2_row(
            '07/01/2026', 'Test Two-Sided', credit='50.00', debit='-50.00'
        )
        with pytest.raises(AmbiguousTransactionDirectionError):
            _normalized(csv_text, where='test')

    def test_neither_debit_nor_credit_populated_yields_none_not_nan(self):
        """Direction must be Python `None`, not a float NaN left over from
        pandas' default fill: a NaN sitting in a TEXT column is not the SQL
        NULL a directionless row needs downstream.
        """
        csv_text = V2_HEADER_LINE + _v2_row('07/01/2026', 'Test No Money')
        df = _normalized(csv_text, where='test')
        assert df.loc[0, 'Type'] is None

    def test_real_statement_available_row_has_no_direction(self):
        df = _normalized(_fixture_text('FreeChecking', '2026.csv'), where='test')
        row = df[df['Description'] == 'STATEMENT AVAILABLE'].iloc[0]
        assert row['Type'] is None

    def test_zero_dollar_debit_is_a_debit_not_directionless(self):
        """Presence must be checked with `notna()`, never `!= 0`: a $0.00 fee
        parses to 0.0, which is falsy but PRESENT. Rewriting the presence
        check as `!= 0` would silently misclassify this row as directionless.
        """
        csv_text = V2_HEADER_LINE + _v2_row('07/01/2026', 'Test Zero Fee', debit='0.00')
        df = _normalized(csv_text, where='test')
        assert df.loc[0, 'Type'] == 'DEBIT'


class TestDateParsing:
    def test_v2_day_and_month_are_not_swapped(self):
        """03/04/2026 must parse to March 4th, not April 3rd - the exact
        failure mode a format-less/inferred parse would risk.
        """
        csv_text = V2_HEADER_LINE + _v2_row('03/04/2026', 'Test Day Month Order')
        df = _normalized(csv_text, where='test')
        assert df.loc[0, 'DateSK'] == 20260304

    def test_v1_single_digit_month_and_day_parse(self):
        csv_text = (
            'Date,ReferenceNo.,Type,Description,Debit,Credit,CheckNumber,Balance\n'
            '3/4/2026,1,DEPOSIT,Test Single Digit,,10.00,,10.00\n'
        )
        df = _normalized(csv_text, where='test')
        assert df.loc[0, 'DateSK'] == 20260304

    def test_v2_zero_padded_month_and_day_parse(self):
        csv_text = V2_HEADER_LINE + _v2_row('03/04/2026', 'Test Zero Padded', credit='10.00')
        df = _normalized(csv_text, where='test')
        assert df.loc[0, 'DateSK'] == 20260304

    def test_malformed_date_raises_naming_file_and_row_but_not_the_date(self):
        bad_date = '99/99/9999'
        csv_text = V2_HEADER_LINE + _v2_row(bad_date, 'Test Bad Date', credit='10.00')
        with pytest.raises(ValueError) as exc_info:
            _normalized(csv_text, where='Golden1/FreeChecking/bad.csv')
        message = str(exc_info.value)
        assert 'Golden1/FreeChecking/bad.csv' in message
        assert '0' in message  # row position 0 named
        assert bad_date not in message

    def test_blank_date_raises_as_missing_not_as_a_parse_error(self):
        """A blank Date is missing, not malformed: pandas does not raise a
        parse error for it on its own, so it needs a dedicated case to prove
        `_parse_dates` still catches it.
        """
        csv_text = V2_HEADER_LINE + _v2_row('', 'Test Blank Date', credit='10.00')
        with pytest.raises(ValueError, match=re.escape('Golden1/FreeChecking/blank.csv')):
            _normalized(csv_text, where='Golden1/FreeChecking/blank.csv')

    def test_date_sk_dtype_is_int64(self):
        df = _normalized(_fixture_text('FreeChecking', '2026.csv'), where='test')
        assert df['DateSK'].dtype == np.int64


class TestDroppedColumns:
    def test_v2_source_only_columns_do_not_survive_into_the_conformed_frame(self):
        df = _normalized(_fixture_text('FreeChecking', '2026.csv'), where='test')
        lowered = {name.casefold() for name in df.columns}
        for dropped in ('account', 'account type', 'category', 'daily balance', 'check #'):
            assert dropped not in lowered

    def test_check_number_and_balance_carry_the_renamed_v2_values(self):
        df = _normalized(_fixture_text('FreeChecking', '2026.csv'), where='test')
        withdrawal = df[df['Description'] == 'Withdrawal'].iloc[0]
        assert withdrawal['CheckNumber'] == 1058

        apts = df[df['Description'] == 'EXAMPLE APTS'].iloc[0]
        assert apts['Balance'] == 1789.04


class TestSingleFileRowOrder:
    def test_v2_file_is_returned_oldest_first(self):
        df = _normalized(_fixture_text('FreeChecking', '2026.csv'), where='test')
        assert list(df['DateSK']) == sorted(df['DateSK'])

    def test_v1_already_ascending_file_is_left_unchanged(self):
        df = _normalized(_fixture_text('FreeChecking', '2024.csv'), where='test')
        assert list(df['DateSK']) == sorted(df['DateSK'])
        assert df.loc[0, 'Description'] == 'EXAMPLE EMPLOYER (PAYROLL)'

    def test_v2_header_with_ascending_rows_raises(self):
        csv_text = (
            V2_HEADER_LINE
            + _v2_row('01/01/2026', 'Test Oldest', credit='10.00')
            + _v2_row('02/01/2026', 'Test Middle', credit='10.00')
            + _v2_row('03/01/2026', 'Test Newest', credit='10.00')
        )
        with pytest.raises(ValueError, match='newest-first'):
            _normalized(csv_text, where='test')


class TestToOldestFirstRejectsUndeclaredRowOrder:
    """The one place "adding a schema is one declaration" could go wrong in
    silence: a mistyped `row_order` must raise rather than default to
    either direction, or a newest-first file would go unreversed with every
    balance below it reversed instead.
    """

    def test_bogus_row_order_raises_naming_the_bad_value_and_the_declaration_file(self):
        bogus_schema = Golden1CsvSchema(
            version='golden1.vTest',
            header=tuple(LEGACY_COLUMNS),
            sources={name: name for name in LEGACY_COLUMNS},
            date_format='%m/%d/%Y',
            row_order='sideways',
        )
        frame = pd.DataFrame({'Date': ['2026-01-01']})
        dates = pd.to_datetime(pd.Series(['2026-01-01']))

        with pytest.raises(ValueError) as exc_info:
            _to_oldest_first(frame, dates, spec=bogus_schema, where='test')

        message = str(exc_info.value)
        assert 'sideways' in message
        assert 'golden1_schema.py' in message


class TestDirectionlessRowWarning:
    """`_derive_transaction_direction` prints rather than raises when a row
    carries no money at all - a diagnosable oddity, not a failure. The
    warning is still subject to the security rule: it may name a count, not
    a cell value.
    """

    def test_no_money_row_warning_is_printed_and_leaks_no_cell_value(self, capsys):
        canary = 'INVENTED CANARY NO MONEY ROW'
        csv_text = V2_HEADER_LINE + _v2_row('07/01/2026', canary)

        _normalized(csv_text, where='Golden1/FreeChecking/nomoney.csv')

        captured = capsys.readouterr()
        assert 'Golden1/FreeChecking/nomoney.csv' in captured.out
        assert '1 row' in captured.out
        assert canary not in captured.out


class TestAscendingOutOfOrderWarning:
    """`_to_oldest_first` only warns, never raises, when an ascending file
    steps backwards: those exports are already in production, and failing on
    a pre-existing quirk would block a rebuild without making a balance more
    correct.
    """

    def test_backwards_step_in_ascending_file_warns_and_leaks_no_cell_value(self, capsys):
        canary = 'INVENTED CANARY OUT OF ORDER ROW'
        csv_text = (
            'Date,ReferenceNo.,Type,Description,Debit,Credit,CheckNumber,Balance\n'
            f'01/02/2026,1,DEPOSIT,{canary},,10.00,,10.00\n'
            '01/01/2026,2,DEPOSIT,Second Invented Row,,5.00,,15.00\n'
        )

        _normalized(csv_text, account='Savings', where='Golden1/Savings/backwards.csv')

        captured = capsys.readouterr()
        assert 'Golden1/Savings/backwards.csv' in captured.out
        assert '1 row' in captured.out
        assert canary not in captured.out
        assert '5.00' not in captured.out


class TestAmbiguousDirectionMessageContent:
    def test_message_names_count_and_positions_and_leaks_no_cell_value(self):
        canary = 'INVENTED CANARY TWO SIDED ROW'
        csv_text = V2_HEADER_LINE + _v2_row('07/01/2026', canary, credit='50.00', debit='-50.00')

        with pytest.raises(AmbiguousTransactionDirectionError) as exc_info:
            _normalized(csv_text, account='Checking', where='Golden1/Checking/twoSided.csv')

        message = str(exc_info.value)
        assert 'Golden1/Checking/twoSided.csv' in message
        assert '1 row' in message
        assert '[0]' in message
        assert canary not in message
        assert '50.00' not in message
