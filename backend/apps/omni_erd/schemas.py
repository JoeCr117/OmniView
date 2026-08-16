"""The wire shape of the IR.

These mirror `ir.py` one-for-one and exist only because django-ninja needs
Pydantic models to serialise and document a response. `from_attributes` lets
them read the frozen dataclasses directly, so the IR stays the single definition
of the shape and this file never re-decides anything.

A relationship's ends are `source`/`target` rather than the `from`/`to` an ERD
paper would use: `from` is a Python keyword, and - more usefully - React Flow's
own edge type already calls them source and target, so the mapper on the other
side stays a rename-free copy.
"""

from datetime import datetime
from typing import Annotated, Literal

from ninja import Schema
from pydantic import AfterValidator


def _reject_unstorable(value: str) -> str:
    if '\x00' in value:
        raise ValueError('must not contain a NUL character')
    try:
        value.encode('utf-8')
    except UnicodeEncodeError as exc:
        raise ValueError('must not contain unpaired surrogate characters') from exc
    return value


#: Free text that reaches a JSONField, constrained to what the database can hold.
#:
#: Postgres text rejects NUL, and an unpaired surrogate has no UTF-8 encoding, so
#: either one raises `DataError` from psycopg *during the INSERT* - past every
#: service rule, and past django-ninja's error handling, which turns it into a 500
#: with a traceback. Declaring the limit here makes it a 422 at the edge, which is
#: what it is: a value the wire format allows and the store does not.
StorableText = Annotated[str, AfterValidator(_reject_unstorable)]


class ColumnTypeOut(Schema):
    raw: str
    base: str


class ColumnOut(Schema):
    name: str
    position: int
    type: ColumnTypeOut
    nullable: bool
    default: str | None
    comment: str | None
    is_primary_key: bool
    is_foreign_key: bool


class KeyConstraintOut(Schema):
    name: str | None
    columns: list[str]


class EntityOut(Schema):
    id: str
    namespace: str
    name: str
    kind: str
    comment: str | None
    columns: list[ColumnOut]
    primary_key: KeyConstraintOut | None
    unique: list[KeyConstraintOut]


class RelationshipEndOut(Schema):
    entity: str
    columns: list[str]


class RelationshipOut(Schema):
    id: str
    source: RelationshipEndOut
    target: RelationshipEndOut
    cardinality: str
    origin: str
    confidence: float
    note: str | None


class SourceInfoOut(Schema):
    id: str
    dialect: str
    label: str
    captured_at: str
    container: dict[str, str]


class SchemaGraphOut(Schema):
    version: str
    source: SourceInfoOut
    entities: list[EntityOut]
    relationships: list[RelationshipOut]


class SourceOut(Schema):
    id: str
    label: str
    dialect: str
    description: str
    namespaces: list[str]


class PositionOut(Schema):
    x: float
    y: float


#: The three states a card can be in. Mirrors `lib/displayMode.ts:ColumnMode`.
#: A Literal, not a str, so an unknown mode is a 422 rather than a value the
#: frontend has to defend against on every read.
ColumnMode = Literal['all', 'keys', 'none']


class ViewStateOut(Schema):
    # Named `default_mode` rather than `global`, which is a Python keyword. The
    # alternative - a field alias - needs a model config override, and
    # `class Config(Schema.Config)` does not exist under Pydantic v2; that
    # mistake already cost this app once. One name on both sides, no aliasing.
    default_mode: ColumnMode = 'keys'
    overrides: dict[str, ColumnMode] = {}


class LayoutOut(Schema):
    #: {entity_id: {"x": float, "y": float}}
    positions: dict[str, PositionOut]
    view_state: ViewStateOut = ViewStateOut()


class PositionIn(Schema):
    # A model, not `dict[str, float]`: a dict type has no *required* keys, so
    # `{"x": 1}` with no y would validate and then persist a position the
    # frontend cannot read back.
    x: float
    y: float


class ViewStateIn(Schema):
    default_mode: ColumnMode = 'keys'
    overrides: dict[StorableText, ColumnMode] = {}


class LayoutIn(Schema):
    #: Keys are entity ids and land in a JSONField verbatim - `_clean_positions`
    #: bounds how many there are, not what they contain.
    positions: dict[StorableText, PositionIn]
    #: Optional so an older client - or a save that only moved a table - still
    #: validates. Absent means "unchanged", which `save_layout` honours.
    view_state: ViewStateIn | None = None


#: What an admin may assert about a pair of entities. Mirrors
#: `ir.py:OverrideAction`. A Literal, like ColumnMode, so an unknown action is a
#: 422 at the edge instead of a string every reader has to defend against.
OverrideAction = Literal['join', 'suppress']

#: Mirrors `ir.py:Cardinality`.
OverrideCardinality = Literal['many_to_one', 'one_to_one']

#: 'active', or the `ir.py:OverrideProblemCode` saying why the override does not
#: fit the catalog as it stands. Derived on every read, never stored.
OverrideStatus = Literal['active', 'unknown_entity', 'unknown_column', 'self_pair']


class RelationshipOverrideOut(Schema):
    """One stored override, keyed exactly as `services.list_overrides` emits it.

    Directed, not canonical: `source` is the referencing (many) side the admin
    chose. How the row orders its pair is storage's business, and the admin
    reading this list should see back the assertion they made.

    `status` and `detail` are the derived pair - the code to switch on, and the
    sentence naming the table or column that went missing. Both are recomputed
    against the catalog per read.
    """

    id: int
    #: The `ovr:<id>` this override draws as in the graph, so a row in this list
    #: can be matched to the edge on the canvas.
    edge_id: str
    source_id: str
    namespace: str
    source_entity: str
    source_columns: list[str]
    target_entity: str
    target_columns: list[str]
    action: OverrideAction
    cardinality: OverrideCardinality
    note: str
    status: OverrideStatus
    #: '' when active; otherwise names what is missing, verbatim.
    detail: str
    updated_at: datetime
    #: None when the row was written with OMNIVIEW_AUTH_REQUIRED off, or when
    #: the user who wrote it has since been deleted.
    updated_by: str | None


class RelationshipOverrideIn(Schema):
    """An admin's assertion, as they make it: directed, un-normalised.

    `services.save_override` is what orders the pair, validates the column
    pairing and refuses a self-join - so this schema constrains only what a
    *type* can constrain, and nothing here duplicates a service rule.
    """

    source_id: StorableText
    #: Absent means the source's first namespace, which `services` resolves.
    namespace: StorableText | None = None
    #: The referencing (many) side.
    source_entity: StorableText
    #: Paired positionally with `target_columns`; both empty when suppressing.
    source_columns: list[StorableText] = []
    #: The referenced (one) side.
    target_entity: StorableText
    target_columns: list[StorableText] = []
    action: OverrideAction
    cardinality: OverrideCardinality = 'many_to_one'
    note: StorableText = ''


class OverrideIdOut(Schema):
    """Which row a write landed on - the whole of what a write can honestly say.

    Not the full `RelationshipOverrideOut`: `status` is only derivable against a
    live catalog, so returning a row here would either re-introspect on every
    write or ship a status field nobody computed. The client refetches the list,
    which is the one place that answer is real.
    """

    id: int
