"""The claim `ir.py` makes is that two engines' type spellings land on the same
`base`. These tests are that claim, written down."""

import pytest

from ..ir import Entity, normalize_type


@pytest.mark.parametrize(
    ('postgres_spelling', 'databricks_spelling', 'expected_base'),
    [
        ('character varying(50)', 'STRING', 'string'),
        ('text', 'VARCHAR(100)', 'string'),
        ('integer', 'INT', 'integer'),
        ('bigint', 'BIGINT', 'integer'),
        ('numeric(18,2)', 'DECIMAL(18,2)', 'decimal'),
        ('double precision', 'DOUBLE', 'float'),
        ('boolean', 'BOOLEAN', 'boolean'),
        ('date', 'DATE', 'date'),
        ('timestamp with time zone', 'TIMESTAMP', 'timestamp'),
        ('bytea', 'BINARY', 'binary'),
        ('jsonb', 'VARIANT', 'json'),
        ('integer[]', 'ARRAY<INT>', 'array'),
    ],
)
def test_both_dialects_normalise_to_the_same_base(
    postgres_spelling, databricks_spelling, expected_base
):
    assert normalize_type(postgres_spelling).base == expected_base
    assert normalize_type(databricks_spelling).base == expected_base


def test_raw_spelling_is_never_lost():
    """`base` is for grouping; `raw` is what the user actually needs to read."""
    assert normalize_type('numeric(18,2)').raw == 'numeric(18,2)'
    assert normalize_type('  ARRAY<STRING>  ').raw == 'ARRAY<STRING>'


def test_unknown_types_degrade_rather_than_raise():
    """An engine we have never seen must render as a neutral row, not a 500."""
    unknown = normalize_type('geography(Point,4326)')
    assert unknown.base == 'unknown'
    assert unknown.raw == 'geography(Point,4326)'


def test_empty_and_missing_types_are_safe():
    assert normalize_type(None).base == 'unknown'
    assert normalize_type('').base == 'unknown'


def test_case_and_whitespace_do_not_matter():
    assert normalize_type('  Double   Precision ').base == 'float'


def test_entity_ids_are_namespace_qualified():
    """The id is what a saved layout keys on, so it must not collide across
    schemas holding a same-named table."""
    assert Entity.make_id('datavault', 'gold_DimDate') == 'datavault.gold_DimDate'
    assert Entity.make_id('omniview', 'gold_DimDate') != Entity.make_id('datavault', 'gold_DimDate')
