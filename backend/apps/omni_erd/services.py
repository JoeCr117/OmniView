"""Omni-ERD's business logic: build a graph, and remember where you put things.

Callers are behind `AppAccessAuth('omni-erd')`, so these functions do not
re-check whether the requester may use the app - only that they own the layout
they are touching.
"""

from __future__ import annotations

from datetime import datetime, timezone

from django.core.cache import cache
from ninja.errors import HttpError

from .infer import infer_relationships
from .introspect.base import IntrospectionUnavailable
from .ir import IR_VERSION, SchemaGraph, SourceInfo
from .models import ErdLayout
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

    graph = SchemaGraph(
        source=SourceInfo(
            id=source.id,
            dialect=source.dialect,
            label=source.label,
            captured_at=datetime.now(timezone.utc).isoformat(),
            container={'namespace': resolved},
        ),
        entities=tuple(entities),
        relationships=tuple(infer_relationships(entities, declared)),
    )
    cache.set(cache_key, graph, GRAPH_CACHE_TTL_SECONDS)
    return graph


def invalidate_graph(source_id: str, namespace: str) -> None:
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
    layout = ErdLayout.objects.filter(
        user=user, source_id=source.id, namespace=resolved
    ).first()
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
