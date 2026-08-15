"""Unity Catalog -> `ir`, over Databricks SQL.

Written to the same `SchemaIntrospector` protocol as the Postgres adapter, which
is the point: it is the second engine that proves the IR is actually
dialect-neutral rather than a Postgres shape with a general-sounding name.

**Not wired to a live catalog in the POC.** With no `OMNI_ERD_DATABRICKS_CATALOG`
set it raises `IntrospectionUnavailable` and the UI renders an empty state. The
queries below are complete and the row parsing is unit-tested against fixtures;
what is untested is the warehouse round-trip. The `catalog` introspected here is
not carried on `SourceInfo`, so anything downstream emitting qualified names
(the frontend's `buildSelect`) can only produce `schema.relation`, not
`catalog.schema.relation`.

Why UC needs no special-casing: it exposes the ANSI `information_schema` surface
(`tables`, `columns`, `table_constraints`, `key_column_usage`,
`referential_constraints`) per catalog. Its PK/FK constraints are *informational
and NOT ENFORCED*, which is irrelevant here - an ERD wants metadata, not
enforcement, so a non-enforced FK is exactly as drawable as a Postgres one.

On the duplicated client factory: `apps/admin_portal/databricks.py` already
builds a WorkspaceClient with a good fallback chain, and this repeats ~15 lines
of it. That is deliberate. docs/ARCHITECTURE.md's rule is that apps must not
reach into each other - the Admin Portal importing out of ExpenseTracker is the
concrete mistake that rule exists to prevent - and an `omni_erd -> admin_portal`
import would mean deleting the Admin Portal breaks Omni-ERD. If a third app ever
needs a workspace client, the answer is to promote one to `shell/`, not to let
apps import each other. Note the difference in intent, too: the portal
authenticates *on behalf of the visiting admin* so costs/jobs reflect what they
can see, whereas schema metadata is not per-user, so this deliberately uses app
identity only.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from ..ir import (
    Column,
    Entity,
    EntityKind,
    KeyConstraint,
    Relationship,
    RelationshipEnd,
    normalize_type,
)
from .base import IntrospectionUnavailable

#: Warehouse cold starts can exceed the statement API's max inline wait.
STATEMENT_WAIT = '30s'

_ENTITIES_SQL = """
SELECT table_name, table_type, comment
  FROM {catalog}.information_schema.tables
 WHERE table_schema = :namespace
 ORDER BY table_name
"""

_COLUMNS_SQL = """
SELECT table_name, column_name, ordinal_position, full_data_type,
       is_nullable, column_default, comment
  FROM {catalog}.information_schema.columns
 WHERE table_schema = :namespace
 ORDER BY table_name, ordinal_position
"""

_KEYS_SQL = """
SELECT kcu.table_name, tc.constraint_name, tc.constraint_type,
       kcu.ordinal_position, kcu.column_name
  FROM {catalog}.information_schema.table_constraints tc
  JOIN {catalog}.information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.constraint_schema = tc.constraint_schema
 WHERE tc.table_schema = :namespace
   AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
 ORDER BY kcu.table_name, tc.constraint_name, kcu.ordinal_position
"""

# referential_constraints pairs an FK to the *unique* constraint it references;
# joining key_column_usage twice recovers both column lists in ordinal order.
_FOREIGN_KEYS_SQL = """
SELECT rc.constraint_name,
       src.table_name   AS source_table,
       src.column_name  AS source_column,
       tgt.table_schema AS target_namespace,
       tgt.table_name   AS target_table,
       tgt.column_name  AS target_column,
       src.ordinal_position
  FROM {catalog}.information_schema.referential_constraints rc
  JOIN {catalog}.information_schema.key_column_usage src
    ON src.constraint_name = rc.constraint_name
   AND src.constraint_schema = rc.constraint_schema
  JOIN {catalog}.information_schema.key_column_usage tgt
    ON tgt.constraint_name = rc.unique_constraint_name
   AND tgt.constraint_schema = rc.unique_constraint_schema
   AND tgt.ordinal_position = src.ordinal_position
 WHERE src.table_schema = :namespace
 ORDER BY rc.constraint_name, src.ordinal_position
"""

#: UC table_type -> our EntityKind.
_KIND_BY_TABLE_TYPE: dict[str, EntityKind] = {
    'MANAGED': 'table',
    'EXTERNAL': 'external_table',
    'VIEW': 'view',
    'MATERIALIZED_VIEW': 'materialized_view',
    'STREAMING_TABLE': 'table',
    'FOREIGN': 'external_table',
}


def workspace_client():
    """App-identity WorkspaceClient. See the module docstring on why this is not
    imported from the Admin Portal."""
    try:
        from databricks.sdk import WorkspaceClient

        return WorkspaceClient()
    except Exception as exc:
        raise IntrospectionUnavailable(
            'Databricks is not connected: no workspace credentials in the environment.'
        ) from exc


class DatabricksIntrospector:
    """Reads one Unity Catalog catalog over a SQL warehouse."""

    dialect = 'databricks'

    def __init__(
        self,
        catalog: str | None = None,
        warehouse_id: str | None = None,
        schemas: tuple[str, ...] = (),
    ):
        self.catalog = catalog or os.environ.get('OMNI_ERD_DATABRICKS_CATALOG') or ''
        self.warehouse_id = warehouse_id or os.environ.get('OMNI_ERD_WAREHOUSE_ID') or ''
        self._schemas = schemas

    @property
    def configured(self) -> bool:
        return bool(self.catalog and self.warehouse_id)

    def _require_configured(self) -> None:
        if not self.configured:
            raise IntrospectionUnavailable(
                'No Unity Catalog source is configured. Set OMNI_ERD_DATABRICKS_CATALOG '
                'and OMNI_ERD_WAREHOUSE_ID to enable the Databricks source.'
            )

    def _query(self, sql: str, namespace: str) -> list[list[str | None]]:
        self._require_configured()
        client = workspace_client()
        try:
            response = client.statement_execution.execute_statement(
                warehouse_id=self.warehouse_id,
                statement=sql.format(catalog=self.catalog),
                parameters=[{'name': 'namespace', 'value': namespace}],
                wait_timeout=STATEMENT_WAIT,
            )
        except Exception as exc:
            raise IntrospectionUnavailable(f'Databricks query failed: {exc}') from exc
        return rows_of(response)

    def namespaces(self) -> list[str]:
        return list(self._schemas)

    def entities(self, namespace: str) -> list[Entity]:
        return parse_entities(
            namespace,
            self._query(_ENTITIES_SQL, namespace),
            self._query(_COLUMNS_SQL, namespace),
            self._query(_KEYS_SQL, namespace),
            self._query(_FOREIGN_KEYS_SQL, namespace),
        )

    def declared_relationships(self, namespace: str) -> list[Relationship]:
        return parse_relationships(namespace, self._query(_FOREIGN_KEYS_SQL, namespace))


def rows_of(response) -> list[list[str | None]]:
    """Flatten a StatementResponse into plain string rows.

    The SDK returns everything as text in `result.data_array`; an empty result
    set omits `data_array` entirely rather than sending [].
    """
    result = getattr(response, 'result', None)
    return list(getattr(result, 'data_array', None) or [])


# The parsing below is deliberately free of any SDK type so it can be tested
# against literal rows - which is the whole of this adapter's POC test coverage.


def parse_entities(
    namespace: str,
    entity_rows: list,
    column_rows: list,
    key_rows: list,
    foreign_key_rows: list,
) -> list[Entity]:
    columns_by_table: dict[str, list[Column]] = {}
    for table, column, position, raw_type, is_nullable, default, comment in column_rows:
        columns_by_table.setdefault(table, []).append(
            Column(
                name=column,
                position=int(position),
                type=normalize_type(raw_type),
                # information_schema reports nullability as the string
                # 'YES'/'NO', not a boolean.
                nullable=str(is_nullable).upper() == 'YES',
                default=default,
                comment=comment,
            )
        )

    grouped_keys: dict[tuple[str, str, str], list[str]] = {}
    for table, name, constraint_type, _position, column in key_rows:
        grouped_keys.setdefault((table, name, constraint_type), []).append(column)

    primary: dict[str, KeyConstraint] = {}
    unique: dict[str, list[KeyConstraint]] = {}
    for (table, name, constraint_type), key_columns in grouped_keys.items():
        constraint = KeyConstraint(name=name, columns=tuple(key_columns))
        if constraint_type == 'PRIMARY KEY':
            primary[table] = constraint
        else:
            unique.setdefault(table, []).append(constraint)

    fk_columns: dict[str, set[str]] = {}
    for _name, source_table, source_column, *_rest in foreign_key_rows:
        fk_columns.setdefault(source_table, set()).add(source_column)

    entities = []
    for table, table_type, comment in entity_rows:
        primary_key = primary.get(table)
        pk_columns = set(primary_key.columns) if primary_key else set()
        entities.append(
            Entity(
                id=Entity.make_id(namespace, table),
                namespace=namespace,
                name=table,
                kind=_KIND_BY_TABLE_TYPE.get(str(table_type).upper(), 'unknown'),
                comment=comment,
                columns=tuple(
                    Column(
                        name=column.name,
                        position=column.position,
                        type=column.type,
                        nullable=column.nullable,
                        default=column.default,
                        comment=column.comment,
                        is_primary_key=column.name in pk_columns,
                        is_foreign_key=column.name in fk_columns.get(table, set()),
                    )
                    for column in columns_by_table.get(table, [])
                ),
                primary_key=primary_key,
                unique=tuple(unique.get(table, [])),
            )
        )
    return entities


def parse_relationships(namespace: str, foreign_key_rows: list) -> list[Relationship]:
    grouped: dict[str, dict] = {}
    for (
        name,
        source_table,
        source_column,
        target_namespace,
        target_table,
        target_column,
        _position,
    ) in foreign_key_rows:
        entry = grouped.setdefault(
            name,
            {
                'source_table': source_table,
                'target_namespace': target_namespace,
                'target_table': target_table,
                'source_columns': [],
                'target_columns': [],
            },
        )
        entry['source_columns'].append(source_column)
        entry['target_columns'].append(target_column)

    return [
        Relationship(
            id=f'fk:{namespace}.{name}',
            source=RelationshipEnd(
                Entity.make_id(namespace, entry['source_table']),
                tuple(entry['source_columns']),
            ),
            target=RelationshipEnd(
                Entity.make_id(entry['target_namespace'], entry['target_table']),
                tuple(entry['target_columns']),
            ),
            cardinality='many_to_one',
            origin='declared',
            confidence=1.0,
            note=f'FOREIGN KEY constraint {name} (informational, NOT ENFORCED)',
        )
        for name, entry in grouped.items()
    ]


def captured_at() -> str:
    return datetime.now(timezone.utc).isoformat()
