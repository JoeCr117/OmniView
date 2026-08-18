"""The one sign convention every parsed row must carry, whatever version it came from.

Golden1 does not state money the same way twice. Across the exports this
repository has seen there are three distinct conventions in play:

    account        version   Debit    Credit   Balance column
    CreditCard     v1        +spend   -paid    all zeros, carries nothing
    CreditCard     v2        -spend   +paid    positive = amount OWED
    deposit accts  v1 & v2   -spend   +paid    positive = money HELD

v2's credit card is internally inconsistent on purpose - it signs money from
the cardholder's side and the balance from the issuer's - so "which convention
is this file in" cannot be answered per file. It is answered per
(version, account), which is why `golden1_schema.py` declares it that way.

This module pins what the parser must produce regardless: money out is
negative, money in is positive, and Balance is a signed contribution to net
worth - positive for an asset, negative for a debt. That is the contract
`frontend/src/apps/expense-tracker/lib/breakdown.ts` documents and relies on;
its `pieSlices` admits only groups whose net is negative, so a row signed the
wrong way does not merely display wrong, it silently leaves the expenses chart
and cancels real spend in its category.

The strongest assertion here is `TestBalanceReconcilesAgainstTheExport`. The v2
export states a closing balance for each date, so the parser's reconstruction
can be checked against the bank's own arithmetic rather than against a number
this test made up. A sign error anywhere in the parser stops that
reconciliation dead, which makes it the regression guard for the whole module.

Fixtures under `docs/examples/Banks/Golden1/` are the synthetic public stand-in
for `Data/` (real, git-ignored bank exports) - never read `Data/` from a test.
"""

import pandas as pd
import pytest

from pipelines.expense_tracker.banks.all_banks.golden1 import Golden1
from pipelines.expense_tracker.banks.source import BankSource

from .conftest import FIXTURES_DIR, _fixture_text

BUDGET_MAP_YAML = (FIXTURES_DIR / 'BudgetMap.yml').read_text(encoding='utf-8-sig')

ALL_ACCOUNTS = ('CreditCard', 'FreeChecking', 'MoneyMarket', 'Savings')

#: Accounts whose stated balance is a debt: a positive number in the export
#: means money owed, so the parsed Balance must come out negative. Everything
#: not named here holds money, and its sign passes through unchanged.
DEBT_ACCOUNTS = frozenset({'CreditCard'})


@pytest.fixture(scope='module')
def parsed_accounts() -> dict[str, pd.DataFrame]:
    """Every fixture account parsed through the full public entry point.

    Module-scoped because `Golden1.__init__` runs `_map_categories`, which is
    a per-row scan over the budget map - paid once here rather than once per
    test.
    """
    bank = Golden1(
        BankSource(
            name='Golden1',
            budget_map_yaml=BUDGET_MAP_YAML,
            accounts={
                account: [
                    ('2024.csv', _fixture_text(account, '2024.csv')),
                    ('2026.csv', _fixture_text(account, '2026.csv')),
                ]
                for account in ALL_ACCOUNTS
            },
        )
    )
    return bank.account_data


def _signed_money(row: pd.Series) -> float:
    """One row's net movement: its debit and its credit, whichever it carries.

    Summed rather than picked, because a row has exactly one of the two and
    NaN in the other - and NaN is how "this row has no debit" is spelled, not
    a value to propagate.
    """
    debit = 0.0 if pd.isna(row['Debit']) else float(row['Debit'])
    credit = 0.0 if pd.isna(row['Credit']) else float(row['Credit'])
    return round(debit + credit, 2)


def _stated_daily_balances(account: str) -> dict[str, float]:
    """`{date: closing balance}` exactly as the v2 fixture states it.

    Read straight from the CSV rather than from anything the parser produced,
    so the comparison below has an independent right-hand side. Blank cells -
    the intraday rows the v2 export leaves empty - are skipped; the dates that
    remain are the ones the bank actually vouched for.
    """
    raw = pd.read_csv(FIXTURES_DIR / account / '2026.csv')
    stated = raw[['Date', 'Daily Balance']].dropna(subset=['Daily Balance'])
    return {
        pd.Timestamp(date).strftime('%Y-%m-%d'): float(balance)
        for date, balance in zip(stated['Date'], stated['Daily Balance'], strict=True)
    }


class TestCanonicalMoneySign:
    """Money out is negative and money in is positive, on every account.

    Parametrized over both schema versions of every account because the bug
    this guards against was version-specific: the v1 credit card was corrected
    downstream by a blanket negation, and when v2 arrived already correct that
    same negation inverted it. Asserting only one version would have kept
    passing throughout.
    """

    @pytest.mark.parametrize('account', ALL_ACCOUNTS)
    def test_debits_are_never_positive(self, parsed_accounts, account):
        debit = parsed_accounts[account]['Debit'].dropna()
        assert (debit <= 0).all(), (
            f'{account}: money leaving the account must be negative; found '
            f'{int((debit > 0).sum())} positive Debit value(s)'
        )

    @pytest.mark.parametrize('account', ALL_ACCOUNTS)
    def test_credits_are_never_negative(self, parsed_accounts, account):
        credit = parsed_accounts[account]['Credit'].dropna()
        assert (credit >= 0).all(), (
            f'{account}: money entering the account must be positive; found '
            f'{int((credit < 0).sum())} negative Credit value(s)'
        )

    @pytest.mark.parametrize('account', ALL_ACCOUNTS)
    def test_the_convention_does_not_change_at_the_version_boundary(self, parsed_accounts, account):
        """The same kind of transaction is signed the same way in both files.

        The frame concatenates a v1 file and a v2 file. If a version's
        convention leaked through unnormalized, the sign of the money columns
        would flip at the boundary between the two source schemas - which is
        precisely the production defect, and is invisible to any check that
        looks at one version alone.
        """
        frame = parsed_accounts[account]
        by_version = {version: block for version, block in frame.groupby('SourceSchema', sort=True)}
        assert set(by_version) == {'golden1.v1', 'golden1.v2'}, (
            f'{account}: expected both schema versions in one frame, found {sorted(by_version)}'
        )

        for version, block in by_version.items():
            debit = block['Debit'].dropna()
            credit = block['Credit'].dropna()
            assert (debit <= 0).all(), f'{account}/{version}: positive Debit'
            assert (credit >= 0).all(), f'{account}/{version}: negative Credit'


class TestCreditCardDirectionIsUnambiguous:
    """A card purchase costs money and a card payment settles it.

    Stated by name rather than by sign alone: the counts above stay green if
    every row is flipped in the same direction, but a purchase reading as
    income is what a reader of the Breakdown actually sees.
    """

    @pytest.mark.parametrize(
        ('description', 'version'),
        [
            ('GREENFIELD MKT 209', 'golden1.v1'),
            ('GREENFIELD MKT 209', 'golden1.v2'),
        ],
    )
    def test_a_purchase_reduces_net_worth(self, parsed_accounts, description, version):
        card = parsed_accounts['CreditCard']
        rows = card[(card['Description'] == description) & (card['SourceSchema'] == version)]
        assert len(rows) == 1, f'expected exactly one {description} row in {version}'

        money = _signed_money(rows.iloc[0])
        assert money < 0, (
            f'{version}: a purchase must be negative, got {money}. A positive '
            'purchase is reported as income and drops out of the expenses pie.'
        )

    @pytest.mark.parametrize('version', ['golden1.v1', 'golden1.v2'])
    def test_a_card_payment_is_positive(self, parsed_accounts, version):
        card = parsed_accounts['CreditCard']
        rows = card[
            (card['Description'] == 'AUTOMATIC PAYMENT') & (card['SourceSchema'] == version)
        ]
        assert len(rows) == 1

        money = _signed_money(rows.iloc[0])
        assert money > 0, f'{version}: a payment against the card must be positive, got {money}'


class TestBalanceReconcilesAgainstTheExport:
    """The parser's balances equal the bank's own, on every date it stated one.

    This is the load-bearing test of the module. The v2 export publishes a
    closing balance per date; the parser rebuilds balances from a running total
    of the money columns. Those two agree only if every sign feeding the
    running total is right, so one wrong sign anywhere - in either schema
    version, in either money column - breaks the reconciliation. It cannot be
    satisfied by a test-shaped constant, because the right-hand side is read
    out of the CSV.
    """

    @pytest.mark.parametrize('account', ALL_ACCOUNTS)
    def test_each_stated_closing_balance_is_reproduced_to_the_cent(self, parsed_accounts, account):
        frame = parsed_accounts[account]
        expected_sign = -1 if account in DEBT_ACCOUNTS else 1

        closing = frame.groupby('Date')['Balance'].last()

        mismatches = {
            date: (expected_sign * stated, float(closing[date]))
            for date, stated in _stated_daily_balances(account).items()
            if date in closing.index and abs(expected_sign * stated - float(closing[date])) >= 0.005
        }
        assert not mismatches, (
            f'{account}: {len(mismatches)} date(s) where the rebuilt closing '
            f'balance differs from the exported one {{date: (expected, got)}}: '
            f'{mismatches}'
        )

    @pytest.mark.parametrize('account', ALL_ACCOUNTS)
    def test_a_debt_balance_is_negative_and_an_asset_balance_is_positive(
        self, parsed_accounts, account
    ):
        """Sign alone, so the failure reads as "the card looks like an asset".

        `TotalBalance` in `silver_Golden1_DailyBalances` sums all four accounts
        into one net worth. A card balance carrying the export's own
        positive-means-owed sign would add the debt to net worth instead of
        subtracting it.
        """
        balance = parsed_accounts[account]['Balance'].dropna()
        non_zero = balance[balance != 0]
        if account in DEBT_ACCOUNTS:
            assert (non_zero <= 0).all(), f'{account}: a debt must not read as an asset'
        else:
            assert (non_zero >= 0).all(), f'{account}: an asset must not read as a debt'


class TestBalanceHasNoGaps:
    """Every row carries a balance, including the intraday rows v2 leaves blank.

    v1 stated a balance on every row; v2 states one per DATE and leaves the
    other rows of that date empty. Passing those through unfilled puts NULLs
    into a column that never had them, and `gold_Golden1_AllTransactions`
    surfaces the column per row.
    """

    @pytest.mark.parametrize('account', ALL_ACCOUNTS)
    def test_no_row_is_missing_a_balance(self, parsed_accounts, account):
        missing = parsed_accounts[account]['Balance'].isna().sum()
        assert missing == 0, f'{account}: {missing} row(s) reach the warehouse with no Balance'
