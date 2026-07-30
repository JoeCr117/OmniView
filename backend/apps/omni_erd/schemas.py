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

from typing import Literal

from ninja import Schema


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
    overrides: dict[str, ColumnMode] = {}


class LayoutIn(Schema):
    positions: dict[str, PositionIn]
    #: Optional so an older client - or a save that only moved a table - still
    #: validates. Absent means "unchanged", which `save_layout` honours.
    view_state: ViewStateIn | None = None
