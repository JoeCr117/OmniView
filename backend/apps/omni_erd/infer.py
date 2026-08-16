"""Guessing the edges a warehouse doesn't declare, and letting an admin correct
the guess.

`datavault` has **zero** foreign keys, and always will: dbt builds every relation
with CREATE TABLE AS SELECT, which carries no constraints. Rendering only
declared edges would draw 22 disconnected boxes. So relationships there have to
be inferred from the one thing the warehouse does have - a consistent naming
convention.

Four tiers decide a pair of entities. The first tier to claim a pair owns it;
the rest stay silent, so the same line is never drawn twice:

1. **An admin override.** An OmniView admin asserting or suppressing a join
   outranks everything below it, *including a declared constraint*. The admin is
   correcting this diagram, and a rule that let a constraint win would leave
   them no way to say "not that one". An override carries
   `origin='admin_override'` and `confidence=1.0`: it is an assertion, not a
   guess, and must not render dashed.
2. **A declared constraint.** Inference never replaces or contradicts one.
3. **Surrogate keys**, at `SURROGATE_KEY_CONFIDENCE`: a `*SK` column points at
   the dimension its stem names.
4. **Same-named primary keys**, at `SAME_NAMED_PK_CONFIDENCE`. Weaker than tier
   3: a coincidence of names, with no convention behind it.

A guess must look like a guess. Tiers 3 and 4 carry `origin='inferred_naming'`,
a `confidence` below 1.0 and a `note` explaining the match; the UI dashes them
and shows the note on hover.

Matching is case-insensitive, in overrides as much as in inference.
dbt-postgres quotes relation names but not column identifiers, so `datavault`
holds CamelCase relations with lowercase columns (`gold_DimDate` has `datesk`,
not `DateSK`). Every emitted edge names columns the way the catalog spells them
*now*, which is what lets an override outlive a rebuild that changes casing.

The inference rules encode this repo's actual conventions, documented in
CLAUDE.md: a `*SK` column is a surrogate key (`DateSK` is `YYYYMMDD`,
`CategorySK` is a hash of Category+SubCategory) and dimensions are named
`*Dim<Thing>` or `Dim<Thing>`.

Overrides arrive as `RelationshipOverride` values, never as Django rows. This
module has no database to reach for, which is what lets its tests run without
one.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from .ir import Entity, OverrideProblem, Relationship, RelationshipEnd, RelationshipOverride

#: A surrogate-key column: the stem is the dimension it points at.
#: 'datesk' -> 'date', 'categorysk' -> 'category'.
_SURROGATE_KEY = re.compile(r'^(?P<stem>.+?)_?sk$', re.IGNORECASE)

SURROGATE_KEY_CONFIDENCE = 0.9
SAME_NAMED_PK_CONFIDENCE = 0.8


def _dimension_stem(entity: Entity) -> str | None:
    """The thing a dimension entity is a dimension *of*, or None if it isn't one.

    `gold_DimDate` -> 'date'; `dim_customer` -> 'customer'; a fact table -> None.
    """
    match = re.search(r'dim_?(?P<stem>[a-z0-9]+)$', entity.name, re.IGNORECASE)
    return match.group('stem').lower() if match else None


def _column_names(entity: Entity) -> dict[str, str]:
    """lowercased name -> the column's real name, so matches are case-insensitive
    but the emitted edge still names columns the way the catalog does."""
    return {column.name.lower(): column.name for column in entity.columns}


def _single_column_primary_key(entity: Entity) -> str | None:
    if entity.primary_key and len(entity.primary_key.columns) == 1:
        return entity.primary_key.columns[0]
    return None


def _first_absent_column(entity: Entity, requested: Sequence[str]) -> str | None:
    names = _column_names(entity)
    return next((name for name in requested if name.lower() not in names), None)


def _catalog_spelling(entity: Entity, requested: Sequence[str]) -> tuple[str, ...]:
    names = _column_names(entity)
    return tuple(names[name.lower()] for name in requested)


def resolve_override(
    override: RelationshipOverride,
    by_id: dict[str, Entity],
) -> Relationship | OverrideProblem:
    """An admin's override read against the catalog in hand.

    An override is written once and re-applied to every later capture, so the
    catalog can drift out from under it: a rebuild renames a table, or leaves a
    column with different casing. Both ends are therefore re-resolved every time
    - entities by id, columns case-insensitively and re-emitted in the spelling
    the catalog uses now.

    A `suppress` resolves to a Relationship the caller never emits: it exists to
    name the pair that no other tier may claim.
    """
    source = by_id.get(override.source.entity)
    if source is None:
        return OverrideProblem('unknown_entity', f'{override.source.entity} is not in this diagram')

    target = by_id.get(override.target.entity)
    if target is None:
        return OverrideProblem('unknown_entity', f'{override.target.entity} is not in this diagram')

    if source.id == target.id:
        return OverrideProblem('self_pair', f'{source.id} cannot be joined to itself')

    for entity, end in ((source, override.source), (target, override.target)):
        absent = _first_absent_column(entity, end.columns)
        if absent is not None:
            return OverrideProblem('unknown_column', f'{entity.id} has no column {absent}')

    return Relationship(
        id=override.id,
        source=RelationshipEnd(source.id, _catalog_spelling(source, override.source.columns)),
        target=RelationshipEnd(target.id, _catalog_spelling(target, override.target.columns)),
        cardinality=override.cardinality,
        origin='admin_override',
        confidence=1.0,
        note=override.note,
    )


def infer_relationships(
    entities: list[Entity],
    declared: list[Relationship],
    overrides: Sequence[RelationshipOverride] = (),
) -> list[Relationship]:
    """Every edge we can justify, most authoritative first: overrides, then
    declared constraints, then inference.

    Guarantees, all asserted in tests: no self-edges; no edge to an entity
    outside `entities`; no inferred duplicate of a declared pair; a stable order
    so the diagram doesn't reshuffle between requests.

    An override that no longer fits the catalog is dropped without comment. The
    diagram is read by every granted user and a dangling override is not their
    problem; the admin sees it listed against the source that owns it.
    """
    by_id = {entity.id: entity for entity in entities}

    # An unordered pair, so a declared A.x -> B.y also suppresses an inferred
    # B.y -> A.x: the same line would be drawn twice.
    seen: set[frozenset[str]] = set()

    resolved_overrides: list[Relationship] = []
    for override in overrides:
        resolved = resolve_override(override, by_id)
        if isinstance(resolved, OverrideProblem):
            continue
        seen.add(frozenset((resolved.source.entity, resolved.target.entity)))
        if override.action == 'join':
            resolved_overrides.append(resolved)

    # Declared edges pointing outside the requested namespace are dropped here
    # rather than at the source: the introspector's job is to report the catalog
    # faithfully, and the renderer cannot draw an edge to a node it lacks.
    kept_declared = [
        relationship
        for relationship in declared
        if relationship.source.entity in by_id
        and relationship.target.entity in by_id
        and frozenset((relationship.source.entity, relationship.target.entity)) not in seen
    ]
    seen.update(
        frozenset((relationship.source.entity, relationship.target.entity))
        for relationship in kept_declared
    )

    inferred: list[Relationship] = []

    def emit(
        source: Entity,
        source_column: str,
        target: Entity,
        target_column: str,
        confidence: float,
        note: str,
    ) -> None:
        if source.id == target.id:
            return
        pair = frozenset((source.id, target.id))
        if pair in seen:
            return
        seen.add(pair)
        inferred.append(
            Relationship(
                id=f'inf:{source.id}.{source_column}->{target.id}.{target_column}',
                source=RelationshipEnd(source.id, (source_column,)),
                target=RelationshipEnd(target.id, (target_column,)),
                cardinality='many_to_one',
                origin='inferred_naming',
                confidence=confidence,
                note=note,
            )
        )

    dimensions = {
        stem: entity for entity in entities if (stem := _dimension_stem(entity)) is not None
    }
    columns_by_entity = {entity.id: _column_names(entity) for entity in entities}

    # Rule 1 - surrogate keys. A `*SK` column points at the dimension its stem
    # names, provided that dimension actually carries the same column.
    for entity in entities:
        for column in entity.columns:
            match = _SURROGATE_KEY.match(column.name)
            if not match:
                continue
            dimension = dimensions.get(match.group('stem').lower())
            if dimension is None:
                continue
            target_column = columns_by_entity[dimension.id].get(column.name.lower())
            if target_column is None:
                continue
            emit(
                entity,
                column.name,
                dimension,
                target_column,
                SURROGATE_KEY_CONFIDENCE,
                f'surrogate key: {column.name} matches the {dimension.name} dimension',
            )

    # Rule 2 - a column named exactly like another entity's single-column
    # primary key. Weaker than rule 1: it has no naming convention behind it,
    # only a coincidence of names, so it runs second and loses ties.
    primary_keys = {
        entity.id: pk for entity in entities if (pk := _single_column_primary_key(entity))
    }
    for entity in entities:
        for column in entity.columns:
            if column.is_primary_key:
                continue
            for target_id, target_column in primary_keys.items():
                if target_id == entity.id or column.name.lower() != target_column.lower():
                    continue
                emit(
                    entity,
                    column.name,
                    by_id[target_id],
                    target_column,
                    SAME_NAMED_PK_CONFIDENCE,
                    f'{column.name} matches the primary key of {by_id[target_id].name}',
                )

    return resolved_overrides + kept_declared + inferred
