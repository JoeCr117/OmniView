"""Every CSV layout Golden1 has ever exported, declared as data.

Golden1 changed its export in 2026: the column set, the column order and the row
order all moved. Rather than branch on "is this the new file or the old one",
each version it has emitted is declared here as a `Golden1CsvSchema`, and
`detect_schema` picks one by matching a file's *header*. `golden1.py` then
conforms whatever it found to `LEGACY_COLUMNS` - the single shape the four
`bronze_Golden1_*.sql` models select by name.

Adding a third version is ONE more entry in `GOLDEN1_CSV_SCHEMAS`. No branch is
added anywhere: an unrecognized header raises rather than being guessed at, so a
new export forces a declaration instead of silently losing a column.

`ACCOUNT_CONVENTIONS` declares the other half of what a file means: not where a
column is, but which way its numbers point. Golden1 signs its pre-2026 credit
card from the ISSUER's side - a purchase is positive, because it increases what
you owe - and everything else from the account holder's. That cannot be keyed by
version, because v1's header is byte-identical across all four accounts, so it
is keyed by (version, account) with a default. Getting this wrong is worse than
getting a column wrong: a missing column is visibly NULL, while an inverted sign
is a plausible number pointing the wrong way.

This module holds no pandas: the table is pure data, so it can be read and
tested without a DataFrame. All parsing mechanics live in `golden1.py`.

Error messages name the file, the column count and any row-1 name some schema
already declares - never a cell value, and never a row-1 name no schema
declares. Row 1 is schema only while the "row 1 is a header" assumption holds,
and every failure here has already broken it, so everything else row 1 carries
is text of unknown provenance and is counted rather than shown - see
`_declared_names_clause`. Pipeline stdout and stderr are returned to the
browser of the user who ran the rebuild; treat them as durable, because one
added logger call in `backend/shell/pipeline.py` would make them so, and these
rows are real personal finances.

Placement: this is Golden1-specific on purpose. Move `Golden1CsvSchema` up into
a shared `banks/` module only when a SECOND bank independently needs schema
versioning - not before.
"""

__all__ = [
    'ACCOUNT_CONVENTIONS',
    'DEFAULT_CONVENTION',
    'GOLDEN1_CSV_SCHEMAS',
    'LEGACY_COLUMNS',
    'Absent',
    'AccountConvention',
    'AmbiguousCsvSchemaError',
    'BalanceMeaning',
    'ColumnSource',
    'Derived',
    'Golden1CsvSchema',
    'MoneySign',
    'RowOrder',
    'UnknownCsvSchemaError',
    'convention_for',
    'detect_schema',
    'normalize_header_name',
    'sniff_header',
]

import csv
import io
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import Enum, auto
from types import MappingProxyType
from typing import Literal

#: The conformed shape every Golden1 file is parsed into, whatever version it
#: is. The bronze dbt models select these names literally, so this tuple is a
#: published contract - changing it is a dbt change too.
LEGACY_COLUMNS: tuple[str, ...] = (
    'Date',
    'ReferenceNo.',
    'Type',
    'Description',
    'Debit',
    'Credit',
    'CheckNumber',
    'Balance',
)


class Derived(Enum):
    """A legacy column with no source column: the parser computes it."""

    TYPE_FROM_MONEY_COLUMNS = auto()


class Absent(Enum):
    """A legacy column this version does not carry: it becomes NULL."""

    NOT_IN_SOURCE = auto()


#: Tagged union: where one legacy column comes from. A `str` is a source column
#: name to copy; the two sentinels are distinct on purpose - "computed" and
#: "missing" are different facts, and `None` standing for both would let a
#: parser bug read as a data fact.
ColumnSource = str | Derived | Absent

#: The orders a version can export its rows in. A closed set on purpose: the
#: parser reverses one of them and leaves the other alone, so a third value has
#: no defined meaning and must raise rather than pick a side.
RowOrder = Literal['ascending', 'descending']


@dataclass(frozen=True, slots=True, eq=False)
class Golden1CsvSchema:
    """One CSV layout Golden1 has exported, and how to conform it.

    Attributes:
        version: Stable id used in logs and error messages, e.g. 'golden1.v2'.
        header: The exact header row this version emits. Documentation, and the
            source of `match_key`. NEVER read positionally - see below.
        sources: LEGACY column name -> where its values come from. Every
            `LEGACY_COLUMNS` entry must appear and nothing else may: a mapping
            that is short one column raises here, at declaration, rather than
            as a bare `KeyError` from inside the parser's assembly loop.
        date_format: `strptime` format for the source's Date column.
        row_order: The order rows appear in the source file, oldest-first
            ('ascending') or newest-first ('descending').

    The money columns are order-INVERTED between versions: v1 emits
    ``..., Debit, Credit, ...`` and v2 emits ``..., Credit, Debit, ...``.
    Reading `header` by position therefore swaps every debit and credit while a
    column-count or shape test still passes. Match and read by NAME only.

    `eq=False` keeps these entries hashable and must stay: a frozen dataclass
    with the default ``eq=True`` generates a `__hash__` over every field, and
    hashing `sources` - a `MappingProxyType` wrapping a dict - raises
    ``TypeError: unhashable type: 'dict'``. Dropping the flag makes putting a
    schema in a set or dict key fail. Identity equality is what these are
    compared by anyway; they are module-level singletons.
    """

    version: str
    header: tuple[str, ...]
    sources: Mapping[str, ColumnSource]
    date_format: str
    row_order: RowOrder

    def __post_init__(self) -> None:
        declared = set(self.sources)
        required = set(LEGACY_COLUMNS)
        if declared != required:
            raise ValueError(
                f'{self.version}: sources must map every LEGACY_COLUMNS entry '
                f'and no others. Missing: {sorted(required - declared)}. '
                f'Unexpected: {sorted(declared - required)}.'
            )

    @property
    def match_key(self) -> tuple[int, frozenset[str]]:
        """Column count and normalized names, as `detect_schema` matches them."""
        return _match_key(self.header)


class UnknownCsvSchemaError(ValueError):
    """No declared schema matches a file's header.

    A `ValueError` because `bank.py` and `factory.py` already signal structural
    problems that way and nothing catches them - it reaches the pipeline's exit
    code, which is the intent.
    """


class AmbiguousCsvSchemaError(ValueError):
    """More than one declared schema matches a file's header."""


GOLDEN1_CSV_SCHEMAS: tuple[Golden1CsvSchema, ...] = (
    Golden1CsvSchema(
        version='golden1.v1',
        header=(
            'Date',
            'ReferenceNo.',
            'Type',
            'Description',
            'Debit',
            'Credit',
            'CheckNumber',
            'Balance',
        ),
        sources=MappingProxyType({name: name for name in LEGACY_COLUMNS}),
        # strptime ignores zero-padding, so one format parses both M/d/yyyy and
        # MM/dd/yyyy. The field exists so a v3 in another format is one more
        # declaration rather than a branch.
        date_format='%m/%d/%Y',
        row_order='ascending',
    ),
    Golden1CsvSchema(
        version='golden1.v2',
        header=(
            'Date',
            'Account',
            'Account Type',
            'Description',
            'Check #',
            'Category',
            'Credit',
            'Debit',
            'Daily Balance',
        ),
        sources=MappingProxyType(
            {
                'Date': 'Date',
                'ReferenceNo.': Absent.NOT_IN_SOURCE,
                # v2's 'Account Type' is the account KIND (Checking, Credit Card).
                # Legacy 'Type' is the transaction DIRECTION (DEBIT, CREDIT). The
                # names nearly match and the meanings do not overlap at all: mapping
                # one to the other writes "Checking" into a direction column, and it
                # stays there. 'Type' is computed from the money columns instead.
                'Type': Derived.TYPE_FROM_MONEY_COLUMNS,
                'Description': 'Description',
                'Debit': 'Debit',
                'Credit': 'Credit',
                'CheckNumber': 'Check #',
                'Balance': 'Daily Balance',
            }
        ),
        date_format='%m/%d/%Y',
        row_order='descending',
    ),
)


class MoneySign(Enum):
    """Whose side of the ledger the `Debit`/`Credit` cells are written from.

    `CASH_FLOW` is the account holder's: money leaving is negative. Every
    Golden1 export uses it except one.

    `CARD_LEDGER` is the issuer's: a purchase is POSITIVE, because it increases
    what you owe. Only the v1 credit card is written this way, and normalizing
    it is the whole reason this enum exists - a $50 purchase must not net to
    -50 on checking and +50 on the card.
    """

    CASH_FLOW = auto()
    CARD_LEDGER = auto()


class BalanceMeaning(Enum):
    """What a positive number in the balance column means, if anything.

    `ASSET` is money held; `DEBT` is money owed, so it must be negated to
    become a signed contribution to net worth. The distinction is not
    cosmetic: `silver_Golden1_DailyBalances` sums all four accounts into one
    `TotalBalance`, and a debt carrying the export's own sign would be ADDED to
    net worth.

    `UNSTATED` is a column that exists and says nothing - the v1 credit card
    exports a `Balance` of literal zero on every row. It is a third case rather
    than a NULL because the cells are populated: only a declaration can
    distinguish "the balance is zero" from "the bank did not fill this in", and
    reading the zeros as a balance is what a running total would silently do.
    """

    ASSET = auto()
    DEBT = auto()
    UNSTATED = auto()


@dataclass(frozen=True, slots=True)
class AccountConvention:
    """How one (schema version, account) states its money and its balance.

    The two axes move independently, which is the fact that makes this a pair
    rather than a single flag: the v2 credit card signs money from the
    cardholder's side and its balance from the issuer's, in the same file.
    """

    money: MoneySign
    balance: BalanceMeaning


#: What an account states unless it is named in `ACCOUNT_CONVENTIONS` below:
#: money as cash flow, balance as an asset. Every deposit account in every
#: version Golden1 has exported, and the safe reading for an account this
#: module has not seen - a new checking-like account is normalized correctly
#: without being declared, and only a credit-like one needs an entry.
DEFAULT_CONVENTION = AccountConvention(MoneySign.CASH_FLOW, BalanceMeaning.ASSET)

#: The exceptions, keyed by (schema version, account name).
#:
#: Keyed by BOTH because neither alone identifies a convention. The version
#: cannot: v1's header is byte-identical across all four accounts, so
#: `detect_schema` returns 'golden1.v1' for the credit card and for checking
#: alike, while only the card is written from the issuer's side. The account
#: cannot either: the card changed its money convention between v1 and v2 while
#: keeping its balance convention, which is exactly the pair below.
ACCOUNT_CONVENTIONS: Mapping[tuple[str, str], AccountConvention] = MappingProxyType(
    {
        ('golden1.v1', 'CreditCard'): AccountConvention(
            money=MoneySign.CARD_LEDGER, balance=BalanceMeaning.UNSTATED
        ),
        ('golden1.v2', 'CreditCard'): AccountConvention(
            money=MoneySign.CASH_FLOW, balance=BalanceMeaning.DEBT
        ),
    }
)


def convention_for(version: str, account: str) -> AccountConvention:
    """How `account` states money and balance under schema `version`."""
    return ACCOUNT_CONVENTIONS.get((version, account), DEFAULT_CONVENTION)


def normalize_header_name(name: str) -> str:
    """Fold a header cell to its comparison form.

    Drops the U+FEFF byte-order mark an export may prefix, trims edge
    whitespace, and casefolds. Internal spaces stay significant: 'Account Type'
    and 'AccountType' are different columns.
    """
    return name.replace('\ufeff', '').strip().casefold()


def sniff_header(csv_text: str) -> tuple[str, ...]:
    """The first row of `csv_text`, or `()` if there is none.

    Parsed with the stdlib csv reader rather than `split(',')`: a quoted comma
    inside a column name would shift every column after it.
    """
    reader = csv.reader(io.StringIO(csv_text, newline=''))
    return tuple(next(reader, ()))


def _match_key(header: Sequence[str]) -> tuple[int, frozenset[str]]:
    """The pair a header and a schema must agree on to match: count, then names.

    The count is half the key because a `frozenset` deduplicates. A ten-column
    export repeating one of v2's nine names collapses to v2's exact set, and
    matching on the set alone would accept it - after which `pd.read_csv`
    renames the repeat to ``Debit.1``, this parser reads the first occurrence by
    name, and the other column vanishes with no error at all.
    """
    return len(header), frozenset(normalize_header_name(name) for name in header)


def _duplicated_names(header: Sequence[str]) -> list[str]:
    """Normalized names appearing more than once in `header`, sorted."""
    counts = Counter(normalize_header_name(name) for name in header)
    return sorted(name for name, count in counts.items() if count > 1)


#: Every column name any declared schema exports, keyed by its normalized form.
#: Membership here is what makes a row-1 name safe to repeat back: the name is
#: then this module's own constant, matched against, not the file's text.
_DECLARED_HEADER_NAMES: Mapping[str, str] = MappingProxyType(
    {normalize_header_name(name): name for schema in GOLDEN1_CSV_SCHEMAS for name in schema.header}
)


def _declared_names_clause(names: Sequence[str], *, label: str) -> str:
    """`names` reported as the declared ones it holds, plus a count of the rest.

    Safety is decided by declaration, not by shape. A name matching
    `_DECLARED_HEADER_NAMES` is echoed as the module constant it matched, so the
    reader still learns how close the file is to v1 or v2; anything else is
    counted and never shown, whatever it looks like. Every caller reaches here
    having already disproved "row 1 is a header", so row 1 may be any line of
    any file - a memo, a payee list, a `.txt` renamed `.csv` - and a heuristic
    that asked whether it *looks* like schema would keep guessing wrong on text
    it cannot bound.
    """
    normalized = [normalize_header_name(name) for name in names]
    declared = sorted(
        {_DECLARED_HEADER_NAMES[name] for name in normalized if name in _DECLARED_HEADER_NAMES}
    )
    undeclared = sum(name not in _DECLARED_HEADER_NAMES for name in normalized)
    return (
        f'{label}: {declared} also declared by a Golden1 schema, plus '
        f'{undeclared} name(s) matching none, withheld as possible data.'
    )


def detect_schema(header: Sequence[str], *, where: str) -> Golden1CsvSchema:
    """The one declared schema whose column set is exactly `header`'s.

    Matching is equality of column count and normalized name set, not "the
    columns I need are present". Subset matching would let v1 claim a
    hypothetical v3 that merely adds a column, silently dropping it; equality
    makes a new export fail loud, and makes ambiguity a static property of the
    table that one test can assert.

    Args:
        header: The file's header row, as read by `sniff_header`.
        where: Bank/account/filename, to locate the offending file in the log.

    Raises:
        UnknownCsvSchemaError: No declared schema has that column set, or the
            header names a column twice.
        AmbiguousCsvSchemaError: More than one declared schema matches.
    """
    declared = [schema.version for schema in GOLDEN1_CSV_SCHEMAS]
    column_count, distinct_names = _match_key(header)

    duplicates = _duplicated_names(header)
    if duplicates:
        raise UnknownCsvSchemaError(
            f'{where}: CSV header of {column_count} columns carries only '
            f'{len(distinct_names)} distinct names, repeating {len(duplicates)}. '
            'A repeated name has no unambiguous source column, so no schema may '
            'match it. '
            f'{_declared_names_clause(duplicates, label="Repeated")} '
            f'Declared: {declared}. Fix the export, or declare it as another '
            'Golden1CsvSchema in GOLDEN1_CSV_SCHEMAS (golden1_schema.py).'
        )

    matches = [
        schema
        for schema in GOLDEN1_CSV_SCHEMAS
        if schema.match_key == (column_count, distinct_names)
    ]

    if not matches:
        raise UnknownCsvSchemaError(
            f'{where}: CSV header of {column_count} columns matches no declared '
            f'Golden1 schema. Declared: {declared}. '
            f'{_declared_names_clause(header, label="Row 1")} '
            'Declare this export as another Golden1CsvSchema in '
            'GOLDEN1_CSV_SCHEMAS (golden1_schema.py).'
        )
    if len(matches) > 1:
        raise AmbiguousCsvSchemaError(
            f'{where}: CSV header of {column_count} columns matches '
            f'{len(matches)} declared Golden1 schemas: '
            f'{[schema.version for schema in matches]}. '
            f'{_declared_names_clause(header, label="Row 1")} '
            'Two Golden1CsvSchema entries declare '
            'the same column set; give each a distinct header in '
            'golden1_schema.py.'
        )
    return matches[0]
