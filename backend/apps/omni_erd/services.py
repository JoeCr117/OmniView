"""Omni-ERD's business logic: graph building and caching, layout storage, relationship-override management.

Authorization depends on the calling router: graph and layout functions are behind
`AppAccessAuth('omni-erd')`; override reads and writes are behind `AdminAuth()` in
`admin_api.admin_router`. Functions do not re-check app access, only ownership of the
layout or override being touched.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import NamedTuple

from django.core.cache import cache
from django.db import IntegrityError
from ninja.errors import HttpError

from .infer import infer_relationships, resolve_override
from .introspect.base import IntrospectionUnavailable
from .ir import (
    IR_VERSION,
    Entity,
    OverrideProblem,
    RelationshipEnd,
    RelationshipOverride,
    SchemaGraph,
    SourceInfo,
)
from .models import ErdLayout, ErdRelationshipOverride
from .sources import Source, get_source

# Schema metadata changes only when someone ships a migration or rebuilds the
# warehouse, so a short TTL is plenty and a rebuild is visible within a minute.
GRAPH_CACHE_TTL_SECONDS = 60

# Deliberately NOT keyed per user, unlike the Admin Portal's Databricks caches.
# Those fetch on-behalf-of the signed-in admin, so a shared entry would leak one
# user's visibility to another. This does not: introspection runs as the app
# itself and returns the same catalog for everyone who is allowed to ask, and
# who is allowed to ask is settled at the router by AppAccessAuth. Layouts, in
# contrast, are per user - and they are not cached at all.
_CACHE_PREFIX = 'omni_erd:graph'


def _require_source(source_id: str) -> Source:
    source = get_source(source_id)
    if source is None:
        raise HttpError(404, f'Unknown source {source_id!r}')
    return source


def _require_namespace(source: Source, namespace: str | None) -> str:
    """Resolve and validate the namespace.

    The allowlist check is the security boundary as well as a usability one: it
    is what keeps a client-supplied string out of the catalog queries.
    """
    if namespace is None:
        if not source.namespaces:
            raise HttpError(422, f'Source {source.id!r} exposes no namespaces')
        return source.namespaces[0]
    if namespace not in source.namespaces:
        raise HttpError(404, f'Source {source.id!r} does not expose namespace {namespace!r}')
    return namespace


def build_graph(source_id: str, namespace: str | None = None) -> SchemaGraph:
    source = _require_source(source_id)
    resolved = _require_namespace(source, namespace)

    cache_key = f'{_CACHE_PREFIX}:{IR_VERSION}:{source.id}:{resolved}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    introspector = source.introspector()
    try:
        entities = introspector.entities(resolved)
        declared = introspector.declared_relationships(resolved)
    except IntrospectionUnavailable as exc:
        # 503 rather than 500: the source is legitimately not readable, which
        # the UI renders as an empty state with the reason.
        raise HttpError(503, str(exc)) from exc

    # Read inside the cache miss, so the cached value is the graph *with*
    # overrides applied. Applying them to a cached graph instead would make a
    # cache hit silently skip them.
    graph = SchemaGraph(
        source=SourceInfo(
            id=source.id,
            dialect=source.dialect,
            label=source.label,
            captured_at=datetime.now(UTC).isoformat(),
            container={'namespace': resolved},
        ),
        entities=tuple(entities),
        relationships=tuple(
            infer_relationships(entities, declared, stored_overrides(source.id, resolved))
        ),
    )
    cache.set(cache_key, graph, GRAPH_CACHE_TTL_SECONDS)
    return graph


def invalidate_graph(source_id: str, namespace: str) -> None:
    # There is no CACHES setting, so this is Django's default LocMemCache: one
    # cache per process. Under gunicorn with N workers a write clears only the
    # calling worker's copy, and its siblings keep serving the previous graph
    # until the TTL expires. A warehouse rebuild has the same window. Do not
    # promise instant effect in UI copy.
    cache.delete(f'{_CACHE_PREFIX}:{IR_VERSION}:{source_id}:{namespace}')


def _is_real_user(user) -> bool:
    """Whether there is anybody to save a layout *for*.

    `OMNIVIEW_AUTH_REQUIRED=0` is a supported mode - the documented escape hatch
    for local work - and in it `request.user` is an AnonymousUser, which is not
    a row and cannot be a foreign key. Without this guard both layout endpoints
    500 on the FK assignment. The diagram itself is unaffected: it just falls
    back to the computed layout on every load, which is the honest behaviour
    when there is no identity to remember anything against.
    """
    return getattr(user, 'is_authenticated', False)


#: What a row with no stored preference reads as. Mirrors
#: `lib/displayMode.ts:DEFAULT_VIEW_STATE` - keys, the compact view.
DEFAULT_VIEW_STATE = {'default_mode': 'keys', 'overrides': {}}


def get_layout(user, source_id: str, namespace: str) -> dict:
    source = _require_source(source_id)
    resolved = _require_namespace(source, namespace)
    if not _is_real_user(user):
        return {'positions': {}, 'view_state': dict(DEFAULT_VIEW_STATE)}
    # Filtered by user, not merely fetched then checked: a layout belonging to
    # someone else must be indistinguishable from one that does not exist.
    layout = ErdLayout.objects.filter(user=user, source_id=source.id, namespace=resolved).first()
    if layout is None:
        return {'positions': {}, 'view_state': dict(DEFAULT_VIEW_STATE)}
    return {
        'positions': layout.positions,
        # Rows written before this field existed hold `{}`, which is not a valid
        # view state - fall back rather than let an empty dict reach the schema.
        'view_state': layout.view_state or dict(DEFAULT_VIEW_STATE),
    }


def save_layout(user, source_id: str, namespace: str, positions: dict, view_state=None) -> None:
    source = _require_source(source_id)
    resolved = _require_namespace(source, namespace)
    if not _is_real_user(user):
        # Silently accepted rather than refused: the caller is a drag that has
        # already happened, and a 4xx here would surface as an error toast for
        # something the user did nothing wrong to cause.
        return
    defaults = {'positions': _clean_positions(positions)}
    if view_state is not None:
        defaults['view_state'] = view_state
    ErdLayout.objects.update_or_create(
        user=user,
        source_id=source.id,
        namespace=resolved,
        defaults=defaults,
    )


#: A layout is one coordinate pair per entity. Well past any real schema, so a
#: payload above this is a bug or an abuse, not a big diagram.
MAX_POSITIONS = 2000


def _clean_positions(positions: dict) -> dict:
    """Bound the stored blob.

    Shape is *not* checked here - `LayoutIn.positions` is typed
    `dict[str, dict[str, float]]`, so django-ninja already 422s a malformed
    payload before this runs. That is the behaviour we want: a layout PUT saves
    the whole diagram, and silently dropping the entries it could not parse
    would send a table back to its auto-layout position with no explanation.

    What Pydantic will happily accept is an *enormous* valid payload, hence the
    cap. Truncating rather than rejecting is deliberate: hitting this means
    something is wrong upstream, and losing the tail of a layout is a far
    smaller problem than a JSONField row nobody can load.
    """
    return dict(list(positions.items())[:MAX_POSITIONS])


class CanonicalPair(NamedTuple):
    """An override's two ends as `ErdRelationshipOverride` stores them.

    The model orders the pair (`entity_a < entity_b`) so that (A, B) and (B, A)
    are one row under a plain unique constraint; the direction inference needs
    survives in `many_side`. A NamedTuple rather than a dict because the row
    fields it produces are exactly what a round-trip is compared against.
    """

    entity_a: str
    entity_b: str
    columns_a: list[str]
    columns_b: list[str]
    many_side: str


def override_to_ir(row: ErdRelationshipOverride) -> RelationshipOverride:
    """One stored row as the direction-carrying value inference consumes.

    `many_side` names which end of the canonical pair is the referencing (many)
    side, which is the whole of what the ordered storage gives up.

    The id is `ovr:<pk>` - stable across warehouse rebuilds and table renames,
    since it names the assertion rather than anything in the catalog, and
    distinguishable at a glance from an inferred `inf:` edge or a declared
    constraint name.

    Takes the row and returns the value: no query, so it is testable against a
    plain unsaved instance.
    """
    ends = ((row.entity_a, row.columns_a), (row.entity_b, row.columns_b))
    (source_entity, source_columns), (target_entity, target_columns) = (
        ends if row.many_side == 'a' else ends[::-1]
    )
    return RelationshipOverride(
        id=f'ovr:{row.pk}',
        source=RelationshipEnd(source_entity, tuple(source_columns)),
        target=RelationshipEnd(target_entity, tuple(target_columns)),
        action=row.action,
        cardinality=row.cardinality,
        # '' is the model's default for "no justification given"; the IR spells
        # that None, and an empty tooltip is not a tooltip.
        note=row.note or None,
    )


def canonical_pair(
    source_entity: str,
    source_columns: Sequence[str],
    target_entity: str,
    target_columns: Sequence[str],
) -> CanonicalPair:
    """The admin's directed choice as the row fields that store it.

    The inverse of `override_to_ir`, and exactly round-trip with it: for any
    stored row, `canonical_pair(*ends_of(override_to_ir(row)))` returns that
    row's own `(entity_a, entity_b, columns_a, columns_b, many_side)`. Sorting
    the two entity ids decides the assignment; `many_side` records where the
    source landed.

    Presumes the two ids differ - equal ids would produce a pair the model's
    `erd_override_pair_is_ordered` check rejects. The write services refuse a
    self-pair with a 422 before reaching here.

    Columns come back as lists because their destination is a JSONField.
    """
    if source_entity < target_entity:
        return CanonicalPair(
            source_entity, target_entity, list(source_columns), list(target_columns), 'a'
        )
    return CanonicalPair(
        target_entity, source_entity, list(target_columns), list(source_columns), 'b'
    )


#: The model's CHECK that the stored pair is ordered. Matched by name so that
#: translating *its* violation cannot swallow another - above all the unique
#: constraint on the pair, whose conflict `update_override` reports as a 409.
PAIR_ORDER_CONSTRAINT = 'erd_override_pair_is_ordered'


@contextmanager
def _ordered_pair_enforced(pair: CanonicalPair) -> Iterator[None]:
    """Refuse a pair the database will not order the way `canonical_pair` did.

    `canonical_pair` orders by Python's `<` (code points) and the model
    re-derives that invariant as a CHECK the database evaluates under the
    columns' collation, so the two agree only while those columns stay `C`.
    They are pinned there - this is the backstop for a deployment where the pin
    is lost (a restored dump, an ICU provider, another engine), so a name pair
    the two disagree about surfaces as a refusal naming the cause rather than an
    uncaught 500 on an admin's save.
    """
    try:
        yield
    except IntegrityError as exc:
        if PAIR_ORDER_CONSTRAINT not in str(exc):
            raise
        raise HttpError(
            422,
            f'{pair.entity_a} and {pair.entity_b} cannot be stored as a pair - this '
            'database sorts those two names differently than OmniView does',
        ) from exc


def stored_overrides(source_id: str, namespace: str) -> list[RelationshipOverride]:
    """Every override written against one diagram, as inference input."""
    return [
        override_to_ir(row)
        for row in ErdRelationshipOverride.objects.filter(source_id=source_id, namespace=namespace)
    ]


def override_status(override: RelationshipOverride, by_id: dict[str, Entity]) -> tuple[str, str]:
    """`('active', '')`, or the problem code and the detail naming what is missing."""
    resolved = resolve_override(override, by_id)
    if isinstance(resolved, OverrideProblem):
        return resolved.code, resolved.detail
    return 'active', ''


def list_overrides(source_id: str, namespace: str | None = None) -> list[dict]:
    """Every override for one diagram, each with its status derived right now.

    Staleness is never stored. A stored flag is a cache with no invalidation:
    the rebuild that *restores* a missing table does not come back to clear it,
    so the row would read stale forever while the diagram drew it correctly.
    The catalog is the only authority on whether an override still fits, so ask
    it on every read.

    `resolve_override` is reused rather than reimplemented, deliberately: the
    rule deciding whether an override applies has two consumers - the diagram
    and this list - and two copies of it would drift into disagreeing about the
    same row.

    Propagates `build_graph`'s 503 when the source cannot be read. An admin
    cannot judge an override against a catalog nobody can introspect, and a list
    that reported every row 'unknown_entity' because the connection was down
    would invite them to delete correct rows.

    The dict keys must match `schemas.RelationshipOverrideOut` exactly, as the wire schema depends on them.
    """
    source = _require_source(source_id)
    resolved = _require_namespace(source, namespace)
    by_id = {entity.id: entity for entity in build_graph(source.id, resolved).entities}

    rows = ErdRelationshipOverride.objects.filter(
        source_id=source.id, namespace=resolved
    ).select_related('created_by', 'updated_by')
    listed = []
    for row in rows:
        override = override_to_ir(row)
        status, detail = override_status(override, by_id)
        listed.append(
            {
                'id': row.pk,
                'edge_id': override.id,
                'source_id': row.source_id,
                'namespace': row.namespace,
                'source_entity': override.source.entity,
                'source_columns': list(override.source.columns),
                'target_entity': override.target.entity,
                'target_columns': list(override.target.columns),
                'action': row.action,
                'cardinality': row.cardinality,
                'note': row.note,
                'status': status,
                'detail': detail,
                'updated_at': row.updated_at,
                'updated_by': getattr(row.updated_by, 'username', None),
            }
        )
    return listed


def _require_valid_ends(
    action: str,
    source_entity: str,
    source_columns: Sequence[str],
    target_entity: str,
    target_columns: Sequence[str],
) -> None:
    """Refuse an assertion that cannot mean anything, rather than adjust it.

    An override is an admin stating a fact about the schema. A silently
    corrected assertion - a dropped column, an invented pairing, a de-duplicated
    repeat - is worse than a refused one, because the admin walks away believing
    something else.

    Column pairs are compared case-insensitively, the way `infer.py` resolves
    them: `datavault` holds CamelCase relations with lowercase columns, so
    `DateSK` and `datesk` name one column and not two.
    """
    if action not in {'join', 'suppress'}:
        raise HttpError(422, f"Unknown action {action!r} - expected 'join' or 'suppress'")
    if source_entity == target_entity:
        raise HttpError(422, f'{source_entity} cannot be joined to itself')
    if action == 'suppress':
        if source_columns or target_columns:
            raise HttpError(422, 'A suppress override names two entities and no columns')
        return
    if not source_columns or not target_columns:
        raise HttpError(422, 'A join override needs at least one column on each side')
    if len(source_columns) != len(target_columns):
        raise HttpError(
            422,
            'A join override pairs its columns positionally, so both sides need the '
            f'same count (got {len(source_columns)} and {len(target_columns)})',
        )
    seen: set[tuple[str, str]] = set()
    for source_column, target_column in zip(source_columns, target_columns, strict=True):
        pair = (source_column.lower(), target_column.lower())
        if pair in seen:
            raise HttpError(
                422,
                'A join override states each column pair once, so '
                f'{source_column} = {target_column} cannot be repeated',
            )
        seen.add(pair)


def _actor(user):
    """Who to record, or None when nobody is signed in.

    `OMNIVIEW_AUTH_REQUIRED=0` is a supported mode in which `request.user` is an
    AnonymousUser - not a row, and so not assignable to a foreign key.
    """
    return user if _is_real_user(user) else None


def save_override(
    user,
    source_id: str,
    namespace: str | None,
    *,
    source_entity: str,
    source_columns: Sequence[str],
    target_entity: str,
    target_columns: Sequence[str],
    action: str,
    cardinality: str = 'many_to_one',
    note: str = '',
) -> ErdRelationshipOverride:
    """Write the standing assertion about one pair of entities.

    `update_or_create` on the pair rather than a 409 on the duplicate. The model
    already says one pair holds one assertion, and the admin's act is "this pair
    joins like *this*" - asking them to hunt down and delete the existing row
    first would be ceremony around a decision they have already made. It also
    means the unique constraint can never surface as a 500.

    The pair is normalised to canonical storage; a self-pair or a column pairing
    that cannot be joined is refused, not repaired.
    """
    source = _require_source(source_id)
    resolved = _require_namespace(source, namespace)
    _require_valid_ends(action, source_entity, source_columns, target_entity, target_columns)
    pair = canonical_pair(source_entity, source_columns, target_entity, target_columns)

    actor = _actor(user)
    fields = {
        'columns_a': pair.columns_a,
        'columns_b': pair.columns_b,
        'many_side': pair.many_side,
        'action': action,
        'cardinality': cardinality,
        'note': note,
        'updated_by': actor,
    }
    with _ordered_pair_enforced(pair):
        override, _ = ErdRelationshipOverride.objects.update_or_create(
            source_id=source.id,
            namespace=resolved,
            entity_a=pair.entity_a,
            entity_b=pair.entity_b,
            defaults=fields,
            create_defaults={**fields, 'created_by': actor},
        )
    invalidate_graph(source.id, resolved)
    return override


def update_override(
    user,
    override_id: int,
    source_id: str,
    namespace: str | None,
    *,
    source_entity: str,
    source_columns: Sequence[str],
    target_entity: str,
    target_columns: Sequence[str],
    action: str,
    cardinality: str = 'many_to_one',
    note: str = '',
) -> ErdRelationshipOverride:
    """Edit one existing override in place.

    409 rather than `update_or_create` here, unlike `save_override`: an edit that
    lands on a pair another row already owns would have to merge two assertions
    into one and silently destroy the row the admin was not looking at. Naming
    the conflict lets them decide which one is right.
    """
    source = _require_source(source_id)
    resolved = _require_namespace(source, namespace)
    _require_valid_ends(action, source_entity, source_columns, target_entity, target_columns)
    pair = canonical_pair(source_entity, source_columns, target_entity, target_columns)

    override = _require_override(source.id, resolved, override_id)
    clash = ErdRelationshipOverride.objects.filter(
        source_id=source.id,
        namespace=resolved,
        entity_a=pair.entity_a,
        entity_b=pair.entity_b,
    ).exclude(pk=override.pk)
    if clash.exists():
        raise HttpError(
            409,
            f'Another override already covers {pair.entity_a} and {pair.entity_b} - '
            'edit or delete that one instead',
        )

    override.entity_a = pair.entity_a
    override.entity_b = pair.entity_b
    override.columns_a = pair.columns_a
    override.columns_b = pair.columns_b
    override.many_side = pair.many_side
    override.action = action
    override.cardinality = cardinality
    override.note = note
    override.updated_by = _actor(user)
    with _ordered_pair_enforced(pair):
        override.save()
    invalidate_graph(source.id, resolved)
    return override


def delete_override(source_id: str, namespace: str | None, override_id: int) -> None:
    source = _require_source(source_id)
    resolved = _require_namespace(source, namespace)
    _require_override(source.id, resolved, override_id).delete()
    invalidate_graph(source.id, resolved)


def _require_override(source_id: str, namespace: str, override_id: int) -> ErdRelationshipOverride:
    """Fetched filtered by diagram, not fetched then checked: an override
    belonging to another source must be indistinguishable from one that does not
    exist."""
    override = ErdRelationshipOverride.objects.filter(
        pk=override_id, source_id=source_id, namespace=namespace
    ).first()
    if override is None:
        raise HttpError(404, f'Unknown override id {override_id}')
    return override
