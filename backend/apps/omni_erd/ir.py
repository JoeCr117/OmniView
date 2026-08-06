"""The dialect-agnostic schema document Omni-ERD draws.

Every introspector produces this and nothing else; the frontend consumes this
and knows nothing about Postgres or Databricks. That indirection is the whole
point of the app: OmniView's own warehouse is Postgres (Lakebase in the cloud),
but the same organisation has data in Unity Catalog reachable over Databricks
SQL, and an ERD renderer must not learn two ways to draw a table.

What makes it agnostic is `ColumnType`: the engine's own spelling is kept
verbatim in `raw` (nothing is lost) alongside a `base` drawn from a small closed
set. `character varying(50)` and `STRING` both normalise to `string`;
`numeric(18,2)` and `DECIMAL(18,2)` both to `decimal`. The renderer groups and
colours on `base` and displays `raw`.

Entity ids are `"<namespace>.<name>"` - stable across captures, which is what
lets a saved layout survive a schema refresh.

Deliberately free of Django imports: `infer.py` and the introspectors are pure
functions over these types, which is what makes them testable without a
database.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

#: Wire format version. Bump when a change would break a cached/persisted graph.
IR_VERSION = '1'

EntityKind = Literal['table', 'view', 'materialized_view', 'external_table', 'unknown']
BaseType = Literal[
    'string',
    'integer',
    'decimal',
    'float',
    'boolean',
    'date',
    'timestamp',
    'binary',
    'json',
    'array',
    'struct',
    'interval',
    'uuid',
    'unknown',
]
RelationshipOrigin = Literal['declared', 'inferred_naming', 'admin_override']
Cardinality = Literal['many_to_one', 'one_to_one']
OverrideAction = Literal['join', 'suppress']
OverrideProblemCode = Literal['unknown_entity', 'unknown_column', 'self_pair']


# Matched against the *stem* of a type name - everything before the first '(' or
# '<', lowercased and whitespace-collapsed. Postgres and Databricks spellings sit
# side by side on purpose: they normalise to the same base, which is the claim
# this whole module exists to make good on.
_BASE_BY_STEM: dict[str, BaseType] = {
    # strings
    'character varying': 'string',
    'varchar': 'string',
    'character': 'string',
    'char': 'string',
    'bpchar': 'string',
    'text': 'string',
    'string': 'string',
    'name': 'string',
    'citext': 'string',
    # integers
    'smallint': 'integer',
    'integer': 'integer',
    'int': 'integer',
    'int2': 'integer',
    'int4': 'integer',
    'int8': 'integer',
    'bigint': 'integer',
    'tinyint': 'integer',
    'byte': 'integer',
    'short': 'integer',
    'long': 'integer',
    'serial': 'integer',
    'bigserial': 'integer',
    # exact numerics
    'numeric': 'decimal',
    'decimal': 'decimal',
    'dec': 'decimal',
    'money': 'decimal',
    # approximate numerics
    'real': 'float',
    'double precision': 'float',
    'double': 'float',
    'float': 'float',
    'float4': 'float',
    'float8': 'float',
    # booleans
    'boolean': 'boolean',
    'bool': 'boolean',
    # temporal
    'date': 'date',
    'timestamp': 'timestamp',
    'timestamp without time zone': 'timestamp',
    'timestamp with time zone': 'timestamp',
    'timestamptz': 'timestamp',
    'timestamp_ntz': 'timestamp',
    'timestamp_ltz': 'timestamp',
    'time': 'timestamp',
    'time without time zone': 'timestamp',
    'time with time zone': 'timestamp',
    'timetz': 'timestamp',
    'interval': 'interval',
    # binary
    'bytea': 'binary',
    'binary': 'binary',
    'varbinary': 'binary',
    # structured
    'json': 'json',
    'jsonb': 'json',
    'variant': 'json',
    'xml': 'json',
    'array': 'array',
    'struct': 'struct',
    'map': 'struct',
    'record': 'struct',
    'row': 'struct',
    'uuid': 'uuid',
}

_WHITESPACE = re.compile(r'\s+')


def normalize_type(raw: str | None) -> 'ColumnType':
    """Map an engine's type spelling onto the closed `BaseType` set.

    Never raises and never drops information: an unrecognised type still keeps
    its `raw` and simply bases as 'unknown', which the UI renders in a neutral
    colour. Adding an engine should mean adding rows to `_BASE_BY_STEM`, not
    special-casing a caller.
    """
    if not raw:
        return ColumnType(raw='', base='unknown')

    text = _WHITESPACE.sub(' ', raw.strip())
    # `numeric(18,2)` -> `numeric`; `ARRAY<STRING>` -> `array`; `int[]` -> `int`
    # (Postgres reports array columns as `ARRAY` in information_schema, but
    # pg_catalog's format_type gives `integer[]` - handle both).
    stem = re.split(r'[(<\[]', text, maxsplit=1)[0].strip().lower()
    is_array = text.endswith('[]') or stem == 'array'

    if is_array:
        return ColumnType(raw=text, base='array')
    return ColumnType(raw=text, base=_BASE_BY_STEM.get(stem, 'unknown'))


@dataclass(frozen=True)
class ColumnType:
    #: The engine's own spelling, verbatim. Always displayed.
    raw: str
    #: The dialect-neutral bucket. Always one of BaseType.
    base: BaseType = 'unknown'


@dataclass(frozen=True)
class Column:
    name: str
    position: int
    type: ColumnType
    nullable: bool = True
    default: str | None = None
    comment: str | None = None
    #: Denormalised onto the column purely so the renderer doesn't have to scan
    #: the relationship list per row to decide which key glyph to draw.
    is_primary_key: bool = False
    is_foreign_key: bool = False


@dataclass(frozen=True)
class KeyConstraint:
    name: str | None
    columns: tuple[str, ...]


@dataclass(frozen=True)
class Entity:
    #: "<namespace>.<name>". Stable across captures - saved layouts key on it.
    id: str
    namespace: str
    name: str
    kind: EntityKind = 'table'
    comment: str | None = None
    columns: tuple[Column, ...] = ()
    primary_key: KeyConstraint | None = None
    unique: tuple[KeyConstraint, ...] = ()

    @staticmethod
    def make_id(namespace: str, name: str) -> str:
        return f'{namespace}.{name}'


@dataclass(frozen=True)
class RelationshipEnd:
    entity: str
    columns: tuple[str, ...]


@dataclass(frozen=True)
class Relationship:
    id: str
    #: The referencing (many) side.
    source: RelationshipEnd
    #: The referenced (one) side.
    target: RelationshipEnd
    cardinality: Cardinality = 'many_to_one'
    origin: RelationshipOrigin = 'declared'
    #: 1.0 for anything the catalog declares; < 1 for guesses. The UI dashes
    #: everything below 1.0 - a guess has to look like a guess.
    confidence: float = 1.0
    #: Human-readable justification, shown in the edge tooltip. Required for
    #: inferred edges; None is fine for declared ones (the constraint name says
    #: it).
    note: str | None = None


@dataclass(frozen=True)
class RelationshipOverride:
    """One admin's assertion about one pair of entities: draw this join, or don't.

    Highest precedence of the four tiers `infer.py` applies - it outranks even a
    declared constraint, because the admin is correcting *this diagram*.

    Direction-carrying: `source` is the referencing (many) side as the admin
    chose it. A `suppress` names the two entities and nothing else, so its ends
    carry empty `columns`.

    Lives here rather than in `infer.py` because it is dialect-agnostic input to
    inference, not a product of it: whoever builds one should not have to import
    the inference engine.
    """

    id: str
    source: RelationshipEnd
    target: RelationshipEnd
    action: OverrideAction
    cardinality: Cardinality = 'many_to_one'
    note: str | None = None


@dataclass(frozen=True)
class OverrideProblem:
    """Why an override could not be applied to the graph in hand.

    An override outlives the catalog it was written against, so a rebuild that
    renames a table leaves it dangling. `detail` names the specific missing
    thing, verbatim, because that is what the admin has to go fix.
    """

    code: OverrideProblemCode
    detail: str


@dataclass(frozen=True)
class SourceInfo:
    id: str
    dialect: str
    label: str
    captured_at: str
    container: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class SchemaGraph:
    source: SourceInfo
    entities: tuple[Entity, ...] = ()
    relationships: tuple[Relationship, ...] = ()
    version: str = IR_VERSION
