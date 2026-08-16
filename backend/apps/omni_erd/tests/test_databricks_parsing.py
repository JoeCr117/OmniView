"""The Databricks adapter is not wired to a live catalog, so its POC coverage is
this: given the rows Unity Catalog's information_schema actually returns, does it
produce the same `ir` shapes the Postgres adapter does?

That equivalence is the whole dialect-agnostic claim. If it only held for
Postgres, `ir.py` would be a Postgres schema with a general-sounding name.
"""

import pytest

from ..introspect.base import IntrospectionUnavailable
from ..introspect.databricks import (
    DatabricksIntrospector,
    parse_entities,
    parse_relationships,
    rows_of,
)

# Shaped exactly like the SDK's data_array: every value a string, including
# ordinals and the YES/NO nullability flag.
ENTITY_ROWS = [
    ['customers', 'MANAGED', 'One row per customer'],
    ['orders', 'MANAGED', None],
    ['orders_summary', 'VIEW', None],
]

COLUMN_ROWS = [
    ['customers', 'customer_id', '1', 'BIGINT', 'NO', None, None],
    ['customers', 'name', '2', 'STRING', 'YES', None, 'Display name'],
    ['orders', 'order_id', '1', 'BIGINT', 'NO', None, None],
    ['orders', 'customer_id', '2', 'BIGINT', 'NO', None, None],
    ['orders', 'total', '3', 'DECIMAL(18,2)', 'YES', None, None],
    ['orders_summary', 'customer_id', '1', 'BIGINT', 'YES', None, None],
]

KEY_ROWS = [
    ['customers', 'customers_pk', 'PRIMARY KEY', '1', 'customer_id'],
    ['orders', 'orders_pk', 'PRIMARY KEY', '1', 'order_id'],
]

FOREIGN_KEY_ROWS = [
    ['orders_customer_fk', 'orders', 'customer_id', 'sales', 'customers', 'customer_id', '1'],
]


def _entities():
    return parse_entities('sales', ENTITY_ROWS, COLUMN_ROWS, KEY_ROWS, FOREIGN_KEY_ROWS)


def test_entity_kinds_map_onto_the_shared_vocabulary():
    kinds = {entity.name: entity.kind for entity in _entities()}
    assert kinds == {'customers': 'table', 'orders': 'table', 'orders_summary': 'view'}


def test_types_normalise_the_same_way_postgres_ones_do():
    orders = next(entity for entity in _entities() if entity.name == 'orders')
    bases = {column.name: column.type.base for column in orders.columns}
    assert bases == {'order_id': 'integer', 'customer_id': 'integer', 'total': 'decimal'}


def test_nullability_survives_the_yes_no_encoding():
    """information_schema reports nullability as a string, not a boolean - the
    trap being that any non-empty string is truthy."""
    customers = next(entity for entity in _entities() if entity.name == 'customers')
    by_name = {column.name: column for column in customers.columns}
    assert by_name['customer_id'].nullable is False
    assert by_name['name'].nullable is True


def test_key_flags_are_denormalised_onto_columns():
    entities = {entity.name: entity for entity in _entities()}

    customers = {column.name: column for column in entities['customers'].columns}
    assert customers['customer_id'].is_primary_key is True

    orders = {column.name: column for column in entities['orders'].columns}
    assert orders['customer_id'].is_foreign_key is True
    assert orders['order_id'].is_primary_key is True
    assert orders['order_id'].is_foreign_key is False


def test_declared_relationships_carry_full_confidence():
    edges = parse_relationships('sales', FOREIGN_KEY_ROWS)

    assert len(edges) == 1
    edge = edges[0]
    assert edge.origin == 'declared'
    assert edge.confidence == 1.0
    assert edge.source.entity == 'sales.orders'
    assert edge.target.entity == 'sales.customers'
    assert 'NOT ENFORCED' in edge.note


def test_composite_keys_keep_their_column_order():
    """The reason we join key_column_usage on ordinal_position: a composite key
    paired in the wrong order is a silently wrong diagram."""
    rows = [
        ['fk', 'child', 'a1', 'sales', 'parent', 'b1', '1'],
        ['fk', 'child', 'a2', 'sales', 'parent', 'b2', '2'],
    ]

    edge = parse_relationships('sales', rows)[0]

    assert edge.source.columns == ('a1', 'a2')
    assert edge.target.columns == ('b1', 'b2')


def test_an_empty_result_set_is_not_an_error():
    """The SDK omits data_array entirely rather than sending [] - a plain
    getattr would hand None to list()."""

    class _Result:
        data_array = None

    class _Response:
        result = _Result()

    assert rows_of(_Response()) == []
    assert rows_of(object()) == []


def test_an_unconfigured_source_explains_itself(monkeypatch):
    """No catalog set is the POC's normal state. It must read as 'not
    configured', not as a crash."""
    monkeypatch.delenv('OMNI_ERD_DATABRICKS_CATALOG', raising=False)
    monkeypatch.delenv('OMNI_ERD_WAREHOUSE_ID', raising=False)
    introspector = DatabricksIntrospector()

    assert introspector.configured is False
    with pytest.raises(IntrospectionUnavailable, match='OMNI_ERD_DATABRICKS_CATALOG'):
        introspector.entities('sales')
