"""Golden1 Credit Union: the reference `Bank` implementation.

Golden1 has exported more than one CSV layout. The 2026 export changed the
column set, the column order and the row order at once, so "the Golden1 columns"
is no longer a single fixed list. Every layout it has emitted is declared in
`golden1_schema.py`; no version is hard-coded here.

Each file is conformed to `LEGACY_COLUMNS` on its own, BEFORE the per-account
concat. A file's own schema therefore decides how its columns, its dates and its
row order are read, and mixing versions inside one account cannot make one
file's shape reinterpret another's. Concatenating first would instead produce
the union of both column sets, half of it null.

Two non-obvious things happen afterwards, both about restating what a file says
into what the warehouse means:

`_to_canonical_signs` is the important one. Golden1 does not sign money the same
way twice - its v1 credit card is written from the ISSUER's side, where a
purchase is positive because it increases what you owe, while every other export
is written from the account holder's. Each file is restated on its own, against
the convention `golden1_schema.py` declares for its (version, account) pair, so
that every row below this module means one thing: money out is negative, money
in is positive, and a balance is a signed contribution to net worth.

`_fill_missing_balances` then reconstructs only the balances the export leaves
empty - v2 states one per date, and v1's credit card states nothing but zeros -
anchoring each to the nearest balance the bank did state.

Every error raised here names the file, a count and 0-based row ordinals, and
never a cell value: this pipeline's stdout and stderr are returned to the
browser of whoever pressed Rebuild, and a single added logger call in
`backend/shell/pipeline.py` would put them in the durable `omniview.*` log, so
they are written as though already durable - these rows are real personal
finances. The rule binds the warnings this module prints exactly as it binds
what it raises.
"""

import io
from collections.abc import Sequence

import numpy as np
import pandas as pd

from ..bank import Bank
from .golden1_schema import (
    LEGACY_COLUMNS,
    Absent,
    AccountConvention,
    BalanceMeaning,
    Derived,
    Golden1CsvSchema,
    MoneySign,
    RowOrder,
    convention_for,
    detect_schema,
    normalize_header_name,
    sniff_header,
)

#: How many offending row positions an error message lists before it stops.
_MAX_REPORTED_ROWS = 10


class AmbiguousTransactionDirectionError(ValueError):
    """A row carries both a debit and a credit, so it has no one direction.

    Halting is the intent. No two-sided row has ever appeared in a Golden1
    export, and a frame full of them is precisely what a mis-mapped money pair
    looks like - both legacy money columns reading the same source column.
    Picking a direction there would write a wrong one into every model below.
    """


def _row_positions(mask: pd.Series) -> list[int]:
    """The first `_MAX_REPORTED_ROWS` 0-based positions where `mask` is true.

    Positions, never values: an error may say where a bad row is, not what is
    in it.
    """
    return np.flatnonzero(mask.to_numpy())[:_MAX_REPORTED_ROWS].tolist()


def _absent_column(index: pd.Index) -> pd.Series:
    """An all-NULL float64 column, for a legacy column this version omits.

    float64 NaN specifically. `to_sql` stages float64 as `double precision` and
    NaN as SQL NULL, which is exactly what a blank cell in a legacy file already
    produces. An object column holding `''`, `None` or `pd.NA` would stage as
    TEXT instead, and bronze's ``CAST("referenceno." AS text)`` would then render
    every populated legacy reference number through `str(2000000001.0)` -
    silently growing a trailing '.0'.
    """
    return pd.Series(np.nan, index=index, dtype='float64')


def _derive_transaction_direction(
    debit: pd.Series,
    credit: pd.Series,
    *,
    where: str,
) -> pd.Series:
    """'DEBIT' / 'CREDIT' / None per row, for a version exporting no Type column.

    Presence is `notna()` - never truthiness, never `!= 0`. A $0.00 fee parses to
    0.0, which is falsy but PRESENT, while a blank parses to NaN; only `notna()`
    tells those apart, and only before anything fills the NaNs in.

    A row with neither money column is left NULL: it has no direction, and NULL
    is at worst uninformative where a guess would be actively wrong. A row with
    both raises.
    """
    has_debit = debit.notna()
    has_credit = credit.notna()

    two_sided = has_debit & has_credit
    if two_sided.any():
        raise AmbiguousTransactionDirectionError(
            f'{where}: {int(two_sided.sum())} row(s) carry both a Debit and a '
            'Credit, so no transaction direction can be derived. First offending '
            f'0-based row positions: {_row_positions(two_sided)}. This is the '
            "signature of a mis-mapped money column - check this version's "
            '`sources` mapping in golden1_schema.py.'
        )

    directionless = ~has_debit & ~has_credit
    if directionless.any():
        print(f'{where}: {int(directionless.sum())} row(s) carry no money at all; Type left NULL')

    # np.full, not a None scalar: pandas converts a scalar None into NaN, and a
    # float NaN in a TEXT column is not the SQL NULL a directionless row needs.
    direction = pd.Series(np.full(len(debit), None, dtype='object'), index=debit.index)
    direction[has_debit] = 'DEBIT'
    direction[has_credit] = 'CREDIT'
    return direction


def _negate(values: pd.Series) -> pd.Series:
    """`values` with every sign flipped, and no negative zero left behind.

    Adding zero is what removes it. `-0.0` is a real float64 value: it compares
    equal to `0.0`, so nothing downstream misreads it, but it renders as
    '-0.00' in a money column, and a $0.00 fee shown as '-$0.00' reads as a bug
    to whoever finds it in the staged table. Golden1 exports those - the v1
    credit card carries 20 zero-valued Credit cells in a single year.
    """
    return -values + 0.0


def _to_canonical_signs(frame: pd.DataFrame, convention: AccountConvention) -> pd.DataFrame:
    """`frame` restated so money out is negative and a debt balance is too.

    This is the one place a version's sign quirks are undone, and it runs per
    file, while `convention` still describes exactly the rows in front of it.
    Everything downstream - staging, bronze, silver, the API, the Breakdown -
    may then assume a single convention on every row of every account.

    Doing it downstream instead is what produced the defect this function
    exists to prevent: `silver_Golden1_CreditCard` applied one blanket
    negation to a table holding both conventions at once, correcting the v1
    rows and inverting the v2 rows in the same expression.

    An `UNSTATED` balance becomes NULL rather than being kept. The v1 credit
    card exports a literal zero on every row, and a zero is indistinguishable
    from a real balance to every consumer below; NULL is the only value that
    says "reconstruct me", which is what `_fill_missing_balances` then does.
    """
    canonical = frame.copy()

    if convention.money is MoneySign.CARD_LEDGER:
        canonical['Debit'] = _negate(canonical['Debit'])
        canonical['Credit'] = _negate(canonical['Credit'])

    if convention.balance is BalanceMeaning.DEBT:
        canonical['Balance'] = _negate(canonical['Balance'])
    elif convention.balance is BalanceMeaning.UNSTATED:
        canonical['Balance'] = _absent_column(canonical.index)

    return canonical


def _parse_dates(dates: pd.Series, *, date_format: str, where: str) -> pd.Series:
    """`dates` as timestamps, read with the format its own version declares.

    An explicit format removes the day-vs-month ambiguity of an inferred one.
    Pandas infers from the first non-null element, so on a concatenated frame a
    single row of one file decides how another file's dates are read.

    Coercing rather than raising is what keeps the offending cell out of the
    log: pandas' own failure message quotes it, and `errors='coerce'` never
    produces that message. It turns a malformed date and a missing one alike
    into `NaT`, which is exactly what the check below reports by position.
    """
    parsed = pd.to_datetime(dates, format=date_format, errors='coerce')

    unparseable = parsed.isna()
    if unparseable.any():
        raise ValueError(
            f'{where}: {int(unparseable.sum())} row(s) have a Date that is empty '
            f'or does not match {date_format!r}. First offending 0-based row '
            f'positions: {_row_positions(unparseable)}.'
        )
    return parsed


def _out_of_order_rows(dates: pd.Series, *, row_order: RowOrder) -> list[int]:
    """0-based positions of rows dated the wrong side of the row before them.

    Only the two declared orders reach here: `_to_oldest_first` rejects anything
    else before it asks, so that an undeclared order cannot be read as one of
    them by default.
    """
    values = dates.to_numpy()
    if row_order == 'descending':
        broken = values[1:] > values[:-1]
    else:
        broken = values[1:] < values[:-1]
    return (np.flatnonzero(broken) + 1).tolist()


def _to_oldest_first(
    frame: pd.DataFrame,
    dates: pd.Series,
    *,
    spec: Golden1CsvSchema,
    where: str,
) -> pd.DataFrame:
    """`frame` in oldest-first order, given the order its version exports in.

    This has to happen per file, while `dates` still describes one file. After
    the per-account concat there is no way to tell a newest-first file's rows
    from an oldest-first file's, and reversing the whole frame would reverse the
    oldest-first blocks too.

    The two directions are checked asymmetrically on purpose. A newest-first
    file that is not actually newest-first raises, because reversing it would
    invent an order. An oldest-first file that is not perfectly ordered only
    warns: those exports are already in production, and failing on a quirk they
    have always had would block a rebuild without making a balance more correct.

    An order that is neither raises rather than defaulting to one of them. This
    is the one place "adding a schema is one declaration" could go wrong in
    silence: a mistyped `row_order` would otherwise leave a newest-first file
    unreversed, and every balance below it reversed with it.

    Raises:
        ValueError: `spec.row_order` is not a declared `RowOrder`, or a
            newest-first file is not actually newest-first.
    """
    if spec.row_order == 'descending':
        out_of_order = _out_of_order_rows(dates, row_order='descending')
        if out_of_order:
            raise ValueError(
                f'{where}: schema {spec.version} declares newest-first rows, but '
                f'{len(out_of_order)} row(s) are dated later than the row above '
                f'them. First offending 0-based row positions: '
                f'{out_of_order[:_MAX_REPORTED_ROWS]}.'
            )
        return frame.iloc[::-1]

    if spec.row_order == 'ascending':
        out_of_order = _out_of_order_rows(dates, row_order='ascending')
        if out_of_order:
            print(
                f'{where}: {len(out_of_order)} row(s) step backwards in an '
                'oldest-first file; order kept exactly as exported'
            )
        return frame

    raise ValueError(
        f'{where}: schema {spec.version} declares row_order '
        f'{spec.row_order!r}, which is not a RowOrder. Declare '
        "'ascending' or 'descending' in golden1_schema.py."
    )


def _normalize_file(csv_text: str, *, account: str, where: str) -> pd.DataFrame:
    """One Golden1 CSV conformed to `LEGACY_COLUMNS`, oldest row first.

    `account` is taken as its own argument rather than sliced back out of
    `where` because it selects the file's sign convention, and a convention
    picked by string-parsing a log label would be one rename away from
    silently inverting a year of money.

    The frame is built column by column BY NAME out of the schema's `sources`
    map, so a source column no legacy column names - v2's 'Account', 'Account
    Type' and 'Category' - simply never enters it. Dropping by omission rather
    than by a drop list also means an unforeseen column in some future export
    cannot leak downstream.

    Position is never used to identify a column, and that is not fastidiousness:
    v1 exports ``Debit, Credit`` where v2 exports ``Credit, Debit``, so a
    positional read inverts every sign in the 2026 files while every
    column-count and shape check still passes.

    Derived columns resolve in a SECOND pass because a derived column may depend
    on legacy columns declared after it in `LEGACY_COLUMNS`: 'Type' precedes the
    'Debit' and 'Credit' it is computed from, so merging the two loops would
    read them before they exist.
    """
    spec = detect_schema(sniff_header(csv_text), where=where)
    raw = pd.read_csv(io.StringIO(csv_text)).rename(columns=normalize_header_name)

    by_legacy_name: dict[str, pd.Series] = {}
    deferred_derivations: list[str] = []
    for legacy_name in LEGACY_COLUMNS:
        source = spec.sources[legacy_name]
        if isinstance(source, str):
            by_legacy_name[legacy_name] = raw[normalize_header_name(source)]
        elif source is Absent.NOT_IN_SOURCE:
            by_legacy_name[legacy_name] = _absent_column(raw.index)
        elif source is Derived.TYPE_FROM_MONEY_COLUMNS:
            deferred_derivations.append(legacy_name)
        else:
            raise ValueError(
                f'{where}: schema {spec.version} maps {legacy_name!r} to a source '
                f'kind this parser does not handle: {source!r}.'
            )

    for legacy_name in deferred_derivations:
        by_legacy_name[legacy_name] = _derive_transaction_direction(
            by_legacy_name['Debit'], by_legacy_name['Credit'], where=where
        )

    conformed = pd.DataFrame(by_legacy_name, columns=list(LEGACY_COLUMNS))
    conformed = _to_canonical_signs(conformed, convention_for(spec.version, account))
    dates = _parse_dates(conformed['Date'], date_format=spec.date_format, where=where)
    conformed['DateSK'] = dates.dt.strftime('%Y%m%d').astype('int64')
    conformed['Date'] = dates.dt.strftime('%Y-%m-%d')

    oldest_first = _to_oldest_first(conformed, dates, spec=spec, where=where).reset_index(drop=True)
    oldest_first['SourceSchema'] = spec.version
    return oldest_first


def _to_chronological_order(frame: pd.DataFrame, *, where: str) -> pd.DataFrame:
    """One account's concatenated frame, oldest transaction first.

    Sorts on the ISO 'YYYY-MM-DD' `Date` string, whose lexical order IS its
    chronological order - so no re-parse is needed after `_normalize_file`
    already parsed it once.

    `kind='stable'` is load-bearing: the default quicksort permutes rows that
    share a date, and those ties ARE the transaction order the running balance
    below and `Indx` above both record.

    Runs for every account, not just the one that needs it. Golden1 exports the
    deposit accounts already ordered - sorting them is a no-op - while the
    credit card's own export is not (39 of its rows are dated before the row
    above them). Sorting only the account known to be unsorted would leave the
    monotonic-`DateSK` invariant every account is held to resting on an
    accident of how the bank happened to write the other three.

    Raises:
        ValueError: a Date is not the ISO string `_normalize_file` writes, so
            the lexical sort would not be chronological. Reported by position;
            the cell itself is never echoed.
    """
    malformed = ~frame['Date'].str.fullmatch(r'\d{4}-\d{2}-\d{2}', na=False)
    if malformed.any():
        raise ValueError(
            f'{where}: {int(malformed.sum())} row(s) carry a Date that is not '
            "'YYYY-MM-DD', so ordering them lexically would not order them by "
            f'date. First offending 0-based row positions: '
            f'{_row_positions(malformed)}. This frame did not come through '
            '_normalize_file.'
        )
    return frame.sort_values('Date', kind='stable', ignore_index=True)


def _fill_missing_balances(frame: pd.DataFrame, *, where: str) -> pd.DataFrame:
    """Every row's balance, reconstructing only the ones the export left empty.

    The bank is trusted wherever it speaks. A stated balance is copied through
    untouched - including v1's, which repeats a day's closing figure on each of
    that day's rows and so cannot be re-derived from a running total without
    changing numbers that have been correct for two years.

    Two kinds of row arrive with nothing to copy, and one rule fills both:

    - v2 states one balance per DATE and leaves that date's earlier rows empty.
    - v1's credit card states a literal zero on every row, which
      `_to_canonical_signs` has already turned into NULL, because a zero is
      indistinguishable from a real balance to everything downstream.

    An empty row's balance is its running total plus the offset implied by the
    nearest STATED balance - taken from the next one where there is one
    (`bfill`), falling back to the previous (`ffill`). Next-first is what makes
    the intraday case right: the figure v2 states for a date is that date's
    CLOSE, sitting on the last row of the date, so an earlier row of the same
    day is that close minus the transactions still to come.

    Anchoring to the NEAREST stated balance rather than to one fixed point is
    what removed this module's hard-coded balance anchor. The offset is now a
    fact read out of the export instead of a constant to re-verify by hand, and
    an inconsistency anywhere stays local instead of shifting the whole history.
    """
    money = (frame['Debit'].fillna(0) + frame['Credit'].fillna(0)).round(2)
    running = money.cumsum().round(2)

    stated = frame['Balance']
    offset = (stated - running).where(stated.notna()).bfill().ffill()

    if offset.isna().all():
        print(
            f'{where}: no balance is stated on any row; balances are a running '
            'total from zero and are relative, not absolute'
        )
        offset = pd.Series(0.0, index=frame.index)

    filled = frame.copy()
    filled['Balance'] = stated.where(stated.notna(), (running + offset).round(2))
    return filled


def _reject_undeclared_schemas(labelled_files: Sequence[tuple[str, str]]) -> None:
    """Raise if any file's schema is undeclared, before any file is parsed.

    `_normalize_file` would raise on the bad file anyway; running the header-only
    check across the whole account first means an undeclared export is named
    before megabytes of CSV are read into frames that get thrown away.
    """
    for where, csv_text in labelled_files:
        detect_schema(sniff_header(csv_text), where=where)


class Golden1(Bank):
    def _parse_transactions(self) -> dict[str, pd.DataFrame]:
        account_data = {}

        for account_name, files in self.source.accounts.items():
            labelled_files = [
                (f'{self.name}/{account_name}/{filename}', csv_text) for filename, csv_text in files
            ]
            _reject_undeclared_schemas(labelled_files)

            df = pd.concat(
                (
                    _normalize_file(csv_text, account=account_name, where=where)
                    for where, csv_text in labelled_files
                ),
                ignore_index=True,
            )
            df['AccountType'] = account_name
            account_where = f'{self.name}/{account_name}'
            df = _to_chronological_order(df, where=account_where)
            df = _fill_missing_balances(df, where=account_where)
            # Indx must be a consequence of the final row order, so it is
            # assigned last - after any reordering above.
            df = df.reset_index(names='Indx')
            leading = ['Indx', 'DateSK', 'Date', 'AccountType']
            account_data[account_name] = df[
                leading + [col for col in df.columns if col not in leading]
            ]

        return account_data
