"""Postgres catalog -> `ir`, over a Django connection alias.

Uses the connections the app already has (`default` -> schema omniview,
`datavault` -> schema datavault), so Omni-ERD adds no credentials, no engine and
no DATABASES entry. Read-only throughout: every statement here is a SELECT
against a catalog.

Two deliberate choices about *which* catalog:

- Entities come from `pg_class`, not `information_schema.tables`, because the
  latter omits materialized views entirely. `datavault` has none today, but
  `gold_Golden1_DailyMetrics` is already a table for performance reasons and a
  future one could easily be a matview.
- Foreign keys come from `pg_constraint`, not `information_schema`'s
  `constraint_column_usage`, whose row order does not reliably pair the
  referencing and referenced columns of a *composite* key. `conkey`/`confkey`
  are ordinal arrays, so the pairing is unambiguous.

Casing trap, specific to this repo: dbt-postgres quotes relation names, so
`datavault` relations are CamelCase on disk (`gold_Golden1_AllTransactions`),
while the models write unquoted column identifiers, which Postgres folds to
lowercase (`datesk`, not `DateSK`). This module reports exactly what the catalog
says and never prettifies - `infer.py` compensates by matching case-insensitively.
"""

from __future__ import annotations

from django.db import connections

from ..ir import Column, Entity, KeyConstraint, Relationship, RelationshipEnd, normalize_type

#: pg_class.relkind -> our EntityKind. 'r' ordinary, 'p' partitioned, 'v' view,
#: 'm' materialized view, 'f' foreign table.
_KIND_BY_RELKIND = {
    'r': 'table',
    'p': 'table',
    'v': 'view',
    'm': 'materialized_view',
    'f': 'external_table',
}

_ENTITIES_SQL = """
SELECT c.relname,
       c.relkind,
       obj_description(c.oid, 'pg_class') AS comment
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = %s
   AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
 ORDER BY c.relname
"""

# format_type() renders the type the way a human writes it ('character
# varying(50)', 'numeric(18,2)', 'integer[]'), which is exactly what we want to
# keep in ColumnType.raw. information_schema.columns would give the bare
# 'character varying' plus separate length columns to reassemble.
_COLUMNS_SQL = """
SELECT c.relname,
       a.attname,
       a.attnum,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS raw_type,
       NOT a.attnotnull                                AS nullable,
       pg_get_expr(d.adbin, d.adrelid)                 AS default_expr,
       col_description(c.oid, a.attnum)                AS comment
  FROM pg_attribute a
  JOIN pg_class c     ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
 WHERE n.nspname = %s
   AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
   AND a.attnum > 0
   AND NOT a.attisdropped
 ORDER BY c.relname, a.attnum
"""

# unnest WITH ORDINALITY preserves the key's column order, which matters for
# composite keys and is exactly what information_schema loses.
_KEYS_SQL = """
SELECT c.relname,
       con.conname,
       con.contype,
       k.ord,
       a.attname
  FROM pg_constraint con
  JOIN pg_class c     ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
 WHERE n.nspname = %s
   AND con.contype IN ('p', 'u')
 ORDER BY c.relname, con.conname, k.ord
"""

_FOREIGN_KEYS_SQL = """
SELECT con.conname,
       src.relname       AS source_table,
       src_col.attname   AS source_column,
       tgt_ns.nspname    AS target_namespace,
       tgt.relname       AS target_table,
       tgt_col.attname   AS target_column,
       k.ord
  FROM pg_constraint con
  JOIN pg_class src        ON src.oid = con.conrelid
  JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
  JOIN pg_class tgt        ON tgt.oid = con.confrelid
  JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
  JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY
       AS k(src_attnum, tgt_attnum, ord) ON TRUE
  JOIN pg_attribute src_col ON src_col.attrelid = src.oid AND src_col.attnum = k.src_attnum
  JOIN pg_attribute tgt_col ON tgt_col.attrelid = tgt.oid AND tgt_col.attnum = k.tgt_attnum
 WHERE src_ns.nspname = %s
   AND con.contype = 'f'
 ORDER BY con.conname, k.ord
"""


def _rows(alias: str, sql: str, params: list) -> list[tuple]:
    with connections[alias].cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


class PostgresIntrospector:
    """Reads one Postgres schema through one Django connection alias."""

    dialect = 'postgres'

    def __init__(self, alias: str, schemas: tuple[str, ...]):
        self.alias = alias
        self._schemas = schemas

    def namespaces(self) -> list[str]:
        return list(self._schemas)

    def entities(self, namespace: str) -> list[Entity]:
        relations = _rows(self.alias, _ENTITIES_SQL, [namespace])
        if not relations:
            return []

        columns_by_table: dict[str, list[Column]] = {}
        for relname, attname, attnum, raw_type, nullable, default, comment in _rows(
            self.alias, _COLUMNS_SQL, [namespace]
        ):
            columns_by_table.setdefault(relname, []).append(
                Column(
                    name=attname,
                    position=attnum,
                    type=normalize_type(raw_type),
                    nullable=bool(nullable),
                    default=default,
                    comment=comment,
                )
            )

        primary_keys, unique_keys = self._key_constraints(namespace)
        foreign_key_columns = self._foreign_key_columns(namespace)

        entities = []
        for relname, relkind, comment in relations:
            primary_key = primary_keys.get(relname)
            pk_columns = set(primary_key.columns) if primary_key else set()
            fk_columns = foreign_key_columns.get(relname, set())
            entities.append(
                Entity(
                    id=Entity.make_id(namespace, relname),
                    namespace=namespace,
                    name=relname,
                    kind=_KIND_BY_RELKIND.get(relkind, 'unknown'),
                    comment=comment,
                    columns=tuple(
                        # Rebuilt rather than mutated: Column is frozen, and the
                        # key flags aren't knowable until the constraints are in.
                        Column(
                            name=column.name,
                            position=column.position,
                            type=column.type,
                            nullable=column.nullable,
                            default=column.default,
                            comment=column.comment,
                            is_primary_key=column.name in pk_columns,
                            is_foreign_key=column.name in fk_columns,
                        )
                        for column in columns_by_table.get(relname, [])
                    ),
                    primary_key=primary_key,
                    unique=tuple(unique_keys.get(relname, [])),
                )
            )
        return entities

    def _key_constraints(
        self, namespace: str
    ) -> tuple[dict[str, KeyConstraint], dict[str, list[KeyConstraint]]]:
        grouped: dict[tuple[str, str, str], list[str]] = {}
        for relname, conname, contype, _ord, attname in _rows(self.alias, _KEYS_SQL, [namespace]):
            grouped.setdefault((relname, conname, contype), []).append(attname)

        primary: dict[str, KeyConstraint] = {}
        unique: dict[str, list[KeyConstraint]] = {}
        for (relname, conname, contype), columns in grouped.items():
            constraint = KeyConstraint(name=conname, columns=tuple(columns))
            if contype == 'p':
                primary[relname] = constraint
            else:
                unique.setdefault(relname, []).append(constraint)
        return primary, unique

    def _foreign_key_columns(self, namespace: str) -> dict[str, set[str]]:
        columns: dict[str, set[str]] = {}
        for _name, source_table, source_column, *_rest in _rows(
            self.alias, _FOREIGN_KEYS_SQL, [namespace]
        ):
            columns.setdefault(source_table, set()).add(source_column)
        return columns

    def declared_relationships(self, namespace: str) -> list[Relationship]:
        grouped: dict[str, dict] = {}
        for (
            conname,
            source_table,
            source_column,
            target_namespace,
            target_table,
            target_column,
            _ord,
        ) in _rows(self.alias, _FOREIGN_KEYS_SQL, [namespace]):
            entry = grouped.setdefault(
                conname,
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

        relationships = []
        for conname, entry in grouped.items():
            source_id = Entity.make_id(namespace, entry['source_table'])
            target_id = Entity.make_id(entry['target_namespace'], entry['target_table'])
            relationships.append(
                Relationship(
                    id=f'fk:{namespace}.{conname}',
                    source=RelationshipEnd(source_id, tuple(entry['source_columns'])),
                    target=RelationshipEnd(target_id, tuple(entry['target_columns'])),
                    cardinality='many_to_one',
                    origin='declared',
                    confidence=1.0,
                    note=f'FOREIGN KEY constraint {conname}',
                )
            )
        return relationships
