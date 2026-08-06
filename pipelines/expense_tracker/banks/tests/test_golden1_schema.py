"""Golden1 schema declaration table + header detection.

Covers `golden1_schema.py` only: `GOLDEN1_CSV_SCHEMAS`, `sniff_header` and
`detect_schema`. No CSV is fully parsed here - that is
`test_golden1_normalize.py`.
"""

import pytest

from pipelines.expense_tracker.banks.all_banks import golden1_schema as golden1_schema_module
from pipelines.expense_tracker.banks.all_banks.golden1_schema import (
    GOLDEN1_CSV_SCHEMAS,
    LEGACY_COLUMNS,
    Absent,
    AmbiguousCsvSchemaError,
    Derived,
    Golden1CsvSchema,
    UnknownCsvSchemaError,
    _match_key,
    detect_schema,
    normalize_header_name,
    sniff_header,
)

from .conftest import V2_HEADER

V1_HEADER = (
    'Date', 'ReferenceNo.', 'Type', 'Description',
    'Debit', 'Credit', 'CheckNumber', 'Balance',
)


class TestDeclaredSchemas:
    def test_no_source_reads_a_column_by_position(self):
        """A positional read would swap Debit/Credit between v1 and v2 (they
        are order-inverted) while still passing a shape check. Every declared
        source must therefore be a column NAME or one of the two sentinels,
        never an int index.
        """
        for schema in GOLDEN1_CSV_SCHEMAS:
            for legacy_name, source in schema.sources.items():
                assert not isinstance(source, int), (
                    f'{schema.version}.sources[{legacy_name!r}] is a positional '
                    f'index: {source!r}'
                )

    def test_v2_type_is_derived_from_money_columns_not_copied(self):
        v2 = next(s for s in GOLDEN1_CSV_SCHEMAS if s.version == 'golden1.v2')
        assert v2.sources['Type'] is Derived.TYPE_FROM_MONEY_COLUMNS

    def test_account_type_is_never_declared_as_a_source_value(self):
        """v2's 'Account Type' names the account KIND (Checking, Credit Card),
        not the transaction direction. Mapping legacy 'Type' straight to it
        would write 'Checking' into a direction column and leave it there.
        """
        for schema in GOLDEN1_CSV_SCHEMAS:
            for source in schema.sources.values():
                if isinstance(source, str):
                    assert source != 'Account Type'

    def test_v1_reference_number_is_copied_v2_marks_it_absent(self):
        v1 = next(s for s in GOLDEN1_CSV_SCHEMAS if s.version == 'golden1.v1')
        v2 = next(s for s in GOLDEN1_CSV_SCHEMAS if s.version == 'golden1.v2')
        assert v1.sources['ReferenceNo.'] == 'ReferenceNo.'
        assert v2.sources['ReferenceNo.'] is Absent.NOT_IN_SOURCE

    def test_money_columns_are_order_inverted_between_versions(self):
        v1 = next(s for s in GOLDEN1_CSV_SCHEMAS if s.version == 'golden1.v1')
        v2 = next(s for s in GOLDEN1_CSV_SCHEMAS if s.version == 'golden1.v2')
        assert v1.header.index('Debit') < v1.header.index('Credit')
        assert v2.header.index('Credit') < v2.header.index('Debit')

    def test_row_order_declared_per_version(self):
        v1 = next(s for s in GOLDEN1_CSV_SCHEMAS if s.version == 'golden1.v1')
        v2 = next(s for s in GOLDEN1_CSV_SCHEMAS if s.version == 'golden1.v2')
        assert v1.row_order == 'ascending'
        assert v2.row_order == 'descending'

    def test_match_keys_are_pairwise_distinct(self):
        keys = [schema.match_key for schema in GOLDEN1_CSV_SCHEMAS]
        for i, left in enumerate(keys):
            for right in keys[i + 1:]:
                assert left != right


class TestSniffHeader:
    def test_reads_first_row_only(self):
        csv_text = 'Date,Description\n01/01/2024,COFFEE\n01/02/2024,LUNCH\n'
        assert sniff_header(csv_text) == ('Date', 'Description')

    def test_empty_text_yields_empty_tuple(self):
        assert sniff_header('') == ()

    def test_quoted_comma_inside_header_cell_does_not_split_it(self):
        csv_text = '"Date","Description, Extended","Amount"\n01/01/2024,X,-1.00\n'
        assert sniff_header(csv_text) == ('Date', 'Description, Extended', 'Amount')


class TestDetectSchema:
    def test_v1_header_detects_v1(self):
        spec = detect_schema(V1_HEADER, where='test')
        assert spec.version == 'golden1.v1'

    def test_v2_header_detects_v2(self):
        spec = detect_schema(V2_HEADER, where='test')
        assert spec.version == 'golden1.v2'

    def test_bom_prefixed_and_whitespace_padded_header_still_detects(self):
        messy = ('﻿Date', ' ReferenceNo. ', 'Type', 'Description',
                  'Debit', 'Credit', 'CheckNumber', 'Balance')
        spec = detect_schema(messy, where='test')
        assert spec.version == 'golden1.v1'

    def test_unrecognized_header_raises(self):
        with pytest.raises(UnknownCsvSchemaError):
            detect_schema(('Date', 'Nonsense'), where='test')

    def test_v2_plus_one_extra_column_raises_rather_than_matching_subset(self):
        """Matching must be exact set equality, not "contains the columns I
        need" - a subset match would let a schema silently absorb and drop an
        unforeseen new column from a future export.
        """
        extra = V2_HEADER + ('Memo',)
        with pytest.raises(UnknownCsvSchemaError):
            detect_schema(extra, where='test')

    def test_error_message_names_where_but_leaks_no_row_data(self):
        """This message reaches the durable `omniview.*` log. It must locate
        the offending file, and a CSV's data rows are a real person's finances
        that must never appear in it, even indirectly.
        """
        secret_description = 'ACME PSYCHIATRIC ASSOCIATES PMT'
        csv_text = (
            'Date,Nonsense\n'
            f'01/01/2024,{secret_description}\n'
        )
        header = sniff_header(csv_text)
        with pytest.raises(UnknownCsvSchemaError) as exc_info:
            detect_schema(header, where='Golden1/Checking/rows.csv')
        message = str(exc_info.value)
        assert 'Golden1/Checking/rows.csv' in message
        assert secret_description not in message

    def test_normalize_header_name_folds_bom_whitespace_and_case(self):
        assert normalize_header_name('﻿ Date ') == 'date'
        assert normalize_header_name('AccountType') != normalize_header_name(
            'Account Type'
        )


class TestRowOneRedactionInErrorMessages:
    """What `detect_schema` may repeat back out of row 1, asserted through the
    exception a user's browser actually receives.

    Every failure here has already disproved "row 1 is a header", so row 1 may
    be any line of any file. A name is echoed only when it MATCHES an entry
    some declared schema exports - the echoed text is then this repository's
    own constant, not the file's - and everything else is counted, never
    shown. Echoing by shape instead ("does this look like a column name?")
    leaks a payee the moment a payee happens to look tidy, into a message the
    pipeline returns to the browser of whoever ran the rebuild.
    """

    def test_undeclared_row_one_names_are_counted_never_echoed(self):
        """Row 1 here is a DATA row - a date, an invented payee, an amount.
        None of the three matches a declared name, so the message may say how
        many it withheld and nothing more.
        """
        canary_payee = 'INVENTED CANARY MERCHANT XYZ'
        header = ('01/02/2024', canary_payee, '-42.10')

        with pytest.raises(UnknownCsvSchemaError) as exc_info:
            detect_schema(header, where='test')

        message = str(exc_info.value)
        assert canary_payee not in message
        assert '-42.10' not in message
        assert '01/02/2024' not in message
        assert '3 name(s) matching none' in message

    def test_an_undeclared_name_shaped_like_a_column_name_is_still_withheld(self):
        """The whole point of deciding by declaration rather than by shape: a
        tidy capitalized word with no digits or currency symbol - a memo
        field, a payee - is indistinguishable from a column name and must
        still be withheld. A shape heuristic echoed exactly this.
        """
        canary_memo = 'Merchant'
        header = ('Date', canary_memo, 'Amount')

        with pytest.raises(UnknownCsvSchemaError) as exc_info:
            detect_schema(header, where='test')

        message = str(exc_info.value)
        assert canary_memo not in message
        assert 'Amount' not in message
        assert '2 name(s) matching none' in message

    def test_declared_row_one_names_are_echoed_so_the_reader_can_place_the_file(self):
        """`Date` and `Description` are exported by both v1 and v2, so
        repeating them back is repeating this module's own constants. Without
        them the message could not tell a nearly-correct export from an
        unrelated file.
        """
        header = ('Date', 'Description', 'INVENTED CANARY PAYEE')

        with pytest.raises(UnknownCsvSchemaError) as exc_info:
            detect_schema(header, where='test')

        message = str(exc_info.value)
        assert "'Date'" in message
        assert "'Description'" in message
        assert 'INVENTED CANARY PAYEE' not in message

    def test_a_declared_name_is_echoed_in_the_casing_the_schema_declares(self):
        """Matching is case- and BOM-insensitive, but the echo comes from
        `_DECLARED_HEADER_NAMES`, not from the file. A message that spelled
        the name back the way the FILE spelled it would be quoting the file.
        """
        header = ('﻿ daily balance ', 'INVENTED CANARY PAYEE')

        with pytest.raises(UnknownCsvSchemaError) as exc_info:
            detect_schema(header, where='test')

        message = str(exc_info.value)
        assert "'Daily Balance'" in message
        assert 'daily balance' not in message
        assert 'INVENTED CANARY PAYEE' not in message

    def test_a_repeated_undeclared_name_is_counted_not_shown(self):
        """The duplicate-name failure runs before schema matching and reports
        the repeats through the same clause, so it needs the same guarantee:
        a file whose row 1 repeats a payee must not have it echoed back.
        """
        canary_payee = 'INVENTED CANARY PAYEE'
        header = (canary_payee, canary_payee)

        with pytest.raises(UnknownCsvSchemaError) as exc_info:
            detect_schema(header, where='test')

        message = str(exc_info.value)
        assert canary_payee not in message
        assert 'Repeated' in message
        assert '1 name(s) matching none' in message

    def test_an_empty_row_one_reports_zero_of_each_rather_than_raising(self):
        """An empty file sniffs to `()`. The clause has to survive it - the
        failure a user needs to see is "no schema matches", not a crash inside
        the message that explains it.
        """
        with pytest.raises(UnknownCsvSchemaError) as exc_info:
            detect_schema((), where='test')

        message = str(exc_info.value)
        assert '0 columns' in message
        assert '0 name(s) matching none' in message


class TestDuplicateColumnNames:
    """A header repeating a normalized name has no unambiguous source column
    for the repeat, so it must fail before schema matching is even
    attempted - see the `_match_key` docstring for why matching on the
    deduplicated name set alone would be unsafe.
    """

    def test_repeated_column_name_raises_naming_the_repeat_count(self):
        header = V2_HEADER + ('Credit',)
        with pytest.raises(UnknownCsvSchemaError, match='repeating 1'):
            detect_schema(header, where='test')

    def test_repeated_column_name_error_names_the_repeated_column(self):
        """'Credit' is declared by both v1 and v2, so echoing it back echoes
        this repository's own constant. Naming the repeat is what makes the
        message actionable; an undeclared repeat is only counted, which is
        `TestRowOneRedactionInErrorMessages`.
        """
        header = V2_HEADER + ('Credit',)
        with pytest.raises(UnknownCsvSchemaError) as exc_info:
            detect_schema(header, where='test')
        assert 'credit' in str(exc_info.value).lower()

    def test_match_key_column_count_keeps_a_duplicated_header_distinct_from_v2(self):
        """The half of `_match_key` that isn't the deduplicated name set: a
        10-column header repeating one of v2's 9 names would collapse onto
        v2's exact frozenset if only names were compared. The column count
        is what keeps the two keys distinct, which is what stops that
        collapse from silently matching.
        """
        v2 = next(s for s in GOLDEN1_CSV_SCHEMAS if s.version == 'golden1.v2')
        duplicated_header = V2_HEADER + ('Credit',)
        count, names = _match_key(duplicated_header)
        assert names == v2.match_key[1]
        assert count != len(v2.match_key[1])
        assert (count, names) != v2.match_key


class TestAmbiguousSchema:
    """`AmbiguousCsvSchemaError` is declared and raised but, absent a real
    second bank export with a colliding header, only reachable by installing
    a colliding pair - hence the monkeypatch rather than a real fixture.
    """

    def test_two_schemas_sharing_a_column_set_raise_ambiguous_naming_both(
        self, monkeypatch
    ):
        v2 = next(s for s in GOLDEN1_CSV_SCHEMAS if s.version == 'golden1.v2')
        clone = Golden1CsvSchema(
            version='golden1.v2-clone',
            header=v2.header,
            sources=v2.sources,
            date_format=v2.date_format,
            row_order=v2.row_order,
        )
        monkeypatch.setattr(
            golden1_schema_module, 'GOLDEN1_CSV_SCHEMAS', (v2, clone)
        )

        with pytest.raises(AmbiguousCsvSchemaError) as exc_info:
            golden1_schema_module.detect_schema(V2_HEADER, where='test')

        message = str(exc_info.value)
        assert 'golden1.v2' in message
        assert 'golden1.v2-clone' in message


class TestSchemaPostInitValidation:
    """`Golden1CsvSchema.__post_init__` is the guard that turns a short or
    over-long `sources` mapping into a `ValueError` at declaration time,
    rather than a bare `KeyError` surfacing from inside the parser's
    assembly loop over `LEGACY_COLUMNS`.
    """

    def _v1_kwargs(self, **overrides):
        v1 = next(s for s in GOLDEN1_CSV_SCHEMAS if s.version == 'golden1.v1')
        kwargs = {
            'version': 'test.schema',
            'header': v1.header,
            'sources': dict(v1.sources),
            'date_format': v1.date_format,
            'row_order': v1.row_order,
        }
        kwargs.update(overrides)
        return kwargs

    def test_missing_legacy_column_raises_naming_it(self):
        sources = self._v1_kwargs()['sources']
        del sources['Balance']
        with pytest.raises(ValueError, match=r'Missing:.*Balance'):
            Golden1CsvSchema(**self._v1_kwargs(sources=sources))

    def test_unexpected_extra_key_raises_naming_it(self):
        sources = self._v1_kwargs()['sources']
        sources['Bogus'] = 'Bogus'
        with pytest.raises(ValueError, match=r'Unexpected:.*Bogus'):
            Golden1CsvSchema(**self._v1_kwargs(sources=sources))

    def test_every_legacy_column_present_and_nothing_else_does_not_raise(self):
        Golden1CsvSchema(**self._v1_kwargs(sources={n: n for n in LEGACY_COLUMNS}))
