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
    'LEGACY_COLUMNS',
    'Derived',
    'Absent',
    'ColumnSource',
    'RowOrder',
    'Golden1CsvSchema',
    'GOLDEN1_CSV_SCHEMAS',
    'UnknownCsvSchemaError',
    'AmbiguousCsvSchemaError',
    'normalize_header_name',
    'sniff_header',
    'detect_schema',
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
    'Date', 'ReferenceNo.', 'Type', 'Description',
    'Debit', 'Credit', 'CheckNumber', 'Balance',
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
            'Date', 'ReferenceNo.', 'Type', 'Description',
            'Debit', 'Credit', 'CheckNumber', 'Balance',
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
            'Date', 'Account', 'Account Type', 'Description',
            'Check #', 'Category', 'Credit', 'Debit', 'Daily Balance',
        ),
        sources=MappingProxyType({
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
        }),
        date_format='%m/%d/%Y',
        row_order='descending',
    ),
)


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
_DECLARED_HEADER_NAMES: Mapping[str, str] = MappingProxyType({
    normalize_header_name(name): name
    for schema in GOLDEN1_CSV_SCHEMAS
    for name in schema.header
})


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
    declared = sorted({
        _DECLARED_HEADER_NAMES[name]
        for name in normalized
        if name in _DECLARED_HEADER_NAMES
    })
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
        schema for schema in GOLDEN1_CSV_SCHEMAS
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
