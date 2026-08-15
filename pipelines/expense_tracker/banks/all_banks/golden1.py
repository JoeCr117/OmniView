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

The one non-obvious thing this parser does afterwards is recompute the credit
card's running balance - see CREDIT_CARD_BALANCE_ANCHOR below.

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
    Derived,
    Golden1CsvSchema,
    RowOrder,
    detect_schema,
    normalize_header_name,
    sniff_header,
)

#: Golden1's exported per-row ``Balance`` is only trustworthy at end of day: rows
#: sharing a date carry that day's *closing* balance rather than the balance
#: after each individual transaction. `_fix_intraday_balance` therefore discards
#: the exported column and rebuilds it from a running total, anchored to one
#: date whose closing balance is known to be correct. Anchoring is what fixes the
#: offset; any (date, balance) pair the account holder has verified will do, and
#: the date need not still be present in the CSVs (the nearest earlier date is
#: used instead). Re-anchor this if the account's history is ever re-exported
#: from a different starting point.
CREDIT_CARD_BALANCE_ANCHOR = ('2025-07-12', 1749.18)

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


def _normalize_file(csv_text: str, *, where: str) -> pd.DataFrame:
    """One Golden1 CSV conformed to `LEGACY_COLUMNS`, oldest row first.

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
    dates = _parse_dates(conformed['Date'], date_format=spec.date_format, where=where)
    conformed['DateSK'] = dates.dt.strftime('%Y%m%d').astype('int64')
    conformed['Date'] = dates.dt.strftime('%Y-%m-%d')

    oldest_first = _to_oldest_first(conformed, dates, spec=spec, where=where).reset_index(drop=True)
    oldest_first['SourceSchema'] = spec.version
    return oldest_first


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
                (_normalize_file(csv_text, where=where) for where, csv_text in labelled_files),
                ignore_index=True,
            )
            df['AccountType'] = account_name
            if account_name == 'CreditCard':
                df = self._fix_intraday_balance(
                    df,
                    *CREDIT_CARD_BALANCE_ANCHOR,
                    where=f'{self.name}/{account_name}',
                )
            # Indx must be a consequence of the final row order, so it is
            # assigned last - after any reordering above.
            df = df.reset_index(names='Indx')
            leading = ['Indx', 'DateSK', 'Date', 'AccountType']
            account_data[account_name] = df[
                leading + [col for col in df.columns if col not in leading]
            ]

        return account_data

    def _fix_intraday_balance(
        self,
        df: pd.DataFrame,
        known_date: str,
        known_balance: float,
        *,
        where: str,
    ) -> pd.DataFrame:
        """Compute intraday balances anchored to a known end-of-day balance.

        All monetary values are rounded to two decimals.

        Parameters:
        - df: DataFrame with ['Date', 'Debit', 'Credit']. The transaction amount
            is computed here from 'Debit' and 'Credit'; any exported 'Balance'
            is overwritten rather than read.
        - known_date: string 'YYYY-MM-DD' of the day whose final balance you trust.
        - known_balance: float, the actual balance at the end of that known_date.
        - where: bank/account, to locate the offending frame in the log.

        Returns:
        - DataFrame sorted by Date, with adjusted balance, and same-date rows
          kept in their input order. That tie order is this method's contract -
          it is the transaction order `Indx` goes on to record - and it rests on
          the stable sort below.

        Raises:
        - ValueError: a Date is not the 'YYYY-MM-DD' `_normalize_file` writes,
          or no row is dated on or before `known_date`, leaving the anchor
          unresolvable.
        """
        # kind='stable' is load-bearing: the default quicksort
        # permutes rows that share a date, and those ties ARE the transaction
        # order this method exists to preserve.
        df = df.sort_values('Date', kind='stable', ignore_index=True)
        df2 = df.copy()

        # 2) Round transaction amounts
        df2['Debit'] = (df2['Debit'].fillna(0)).round(2)
        df2['Credit'] = (df2['Credit'].fillna(0)).round(2)
        df2['TransactionAmount'] = (df2['Debit'] + df2['Credit']).round(2)

        # 3) Zero-based running sum (rounded)
        df2['ZeroCumSum'] = df2['TransactionAmount'].cumsum().round(2)

        # 4) Determine anchor date (fallback to the nearest EARLIER date if missing)
        kd = pd.to_datetime(known_date, format='%Y-%m-%d')
        # Coerced, not raised: an inferred parse quotes the offending cell in
        # pandas' own message. '%Y-%m-%d' is what `_normalize_file` writes, so a
        # NaT here means this frame did not come through it.
        parsed_dates = pd.to_datetime(df2['Date'], format='%Y-%m-%d', errors='coerce')
        unparseable = parsed_dates.isna()
        if unparseable.any():
            raise ValueError(
                f'{where}: {int(unparseable.sum())} row(s) reach the balance '
                "rebuild with a Date that is not '%Y-%m-%d'. First offending "
                '0-based row positions in the date-sorted frame: '
                f'{_row_positions(unparseable)}.'
            )
        available_dates = pd.DatetimeIndex(parsed_dates.unique())

        if kd not in available_dates:
            # Filter dates that are less than known_date
            filtered_dates = available_dates[available_dates < kd]
            if not filtered_dates.empty:
                kd = filtered_dates.max()
            else:
                # Handle case when no dates are less than known_date
                raise ValueError(
                    f'{where}: no transaction is dated on or before the balance '
                    f'anchor {known_date}; the anchor cannot be resolved.'
                )

        df2['AnchorDate'] = kd.strftime('%Y-%m-%d')
        # 5) Find zero-Cumsum at last transaction of anchor date
        mask = df2['AnchorDate'] == df2['Date']
        last_idx = df2[mask].index.max()
        zero_at_anchor = df2.at[last_idx, 'ZeroCumSum']

        # 6) Derive and round adjustment
        adjustment = round(known_balance - zero_at_anchor, 2)
        df2['Adjustment'] = adjustment

        # 7) Compute true intraday balances (rounded). Only Balance is copied
        # back: the working columns above stay local to this method.
        df2['Balance'] = (df2['ZeroCumSum'] + adjustment).round(2)
        df['Balance'] = df2['Balance']
        return df
