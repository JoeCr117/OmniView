"""Guessing the edges a warehouse doesn't declare.

`datavault` has **zero** foreign keys, and always will: dbt builds every relation
with CREATE TABLE AS SELECT, which carries no constraints. Rendering only
declared edges would draw 22 disconnected boxes. So relationships there have to
be inferred from the one thing the warehouse does have - a consistent naming
convention.

Three rules govern everything here:

1. **Declared always wins.** Inference runs after the catalog and never replaces
   or contradicts a real constraint.
2. **A guess must look like a guess.** Every inferred edge carries
   `origin='inferred_naming'`, a `confidence` below 1.0 and a `note` explaining
   the match; the UI dashes them and shows the note on hover.
3. **Matching is case-insensitive.** dbt-postgres quotes relation names but not
   column identifiers, so `datavault` holds CamelCase relations with lowercase
   columns (`gold_DimDate` has `datesk`, not `DateSK`). The convention is
   readable only if case is ignored.

The rules encode this repo's actual conventions, documented in CLAUDE.md: a
`*SK` column is a surrogate key (`DateSK` is `YYYYMMDD`, `CategorySK` is a hash
of Category+SubCategory) and dimensions are named `*Dim<Thing>` or `Dim<Thing>`.
"""

from __future__ import annotations

import re

from .ir import Entity, Relationship, RelationshipEnd

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


def infer_relationships(
    entities: list[Entity],
    declared: list[Relationship],
) -> list[Relationship]:
    """Every edge we can justify, declared first then inferred.

    Guarantees, all asserted in tests: no self-edges; no edge to an entity
    outside `entities`; no inferred duplicate of a declared pair; a stable order
    so the diagram doesn't reshuffle between requests.
    """
    by_id = {entity.id: entity for entity in entities}

    # An unordered pair, so a declared A.x -> B.y also suppresses an inferred
    # B.y -> A.x: the same line would be drawn twice.
    seen: set[frozenset[str]] = {
        frozenset((relationship.source.entity, relationship.target.entity))
        for relationship in declared
    }

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

    # Declared edges pointing outside the requested namespace are dropped here
    # rather than at the source: the introspector's job is to report the catalog
    # faithfully, and the renderer cannot draw an edge to a node it lacks.
    kept_declared = [
        relationship
        for relationship in declared
        if relationship.source.entity in by_id and relationship.target.entity in by_id
    ]
    return kept_declared + inferred
