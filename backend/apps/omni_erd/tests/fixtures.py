"""Hand-built `ir` graphs the unit tests reason over.

Modelled on the real `datavault` shape - a fact table carrying `*SK` surrogate
keys plus a `gold_DimDate` calendar dimension - because that is the case
inference exists to handle, and a fixture that doesn't look like production
proves nothing.

Column names are lowercase and relation names CamelCase, matching what
dbt-postgres actually leaves in the database (it quotes relation names but not
column identifiers).
"""

from ..ir import Column, Entity, KeyConstraint, normalize_type


def column(name: str, raw_type: str = 'integer', **kwargs) -> Column:
    return Column(
        name=name,
        position=kwargs.pop('position', 1),
        type=normalize_type(raw_type),
        **kwargs,
    )


def entity(name: str, columns: list[Column], namespace: str = 'datavault', **kwargs) -> Entity:
    return Entity(
        id=Entity.make_id(namespace, name),
        namespace=namespace,
        name=name,
        columns=tuple(
            Column(
                name=c.name,
                position=index + 1,
                type=c.type,
                nullable=c.nullable,
                default=c.default,
                comment=c.comment,
                is_primary_key=c.is_primary_key,
                is_foreign_key=c.is_foreign_key,
            )
            for index, c in enumerate(columns)
        ),
        **kwargs,
    )


def dim_date() -> Entity:
    return entity(
        'gold_DimDate',
        [column('datesk'), column('date', 'text'), column('year')],
        kind='table',
        primary_key=KeyConstraint(name='gold_dimdate_pkey', columns=('datesk',)),
    )


def all_transactions() -> Entity:
    return entity(
        'gold_Golden1_AllTransactions',
        [
            column('datesk'),
            column('categorysk', 'bigint'),
            column('description', 'text'),
            column('amount', 'numeric(18,2)'),
        ],
        kind='view',
    )


def dim_category() -> Entity:
    return entity(
        'gold_DimCategory',
        [column('categorysk', 'bigint'), column('category', 'text')],
        kind='table',
        primary_key=KeyConstraint(name='gold_dimcategory_pkey', columns=('categorysk',)),
    )
