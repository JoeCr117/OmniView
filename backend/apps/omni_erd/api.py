"""Omni-ERD's API surface, mounted once at /api/omni-erd/.

Auth is applied at the mount in config/api.py (AppAccessAuth('omni-erd')) and
inherited by everything here, so every endpoint below needs a grant - staff
bypass. tests/test_enforcement.py is what holds that down.

Read-only with respect to any introspected database: the only thing this app
writes is a user's own diagram layout, in its own table.
"""

from ninja import Router
from ninja.responses import Status

from .schemas import LayoutIn, LayoutOut, SchemaGraphOut, SourceOut
from .services import build_graph, get_layout, save_layout
from .sources import SOURCES

router = Router(tags=['omni-erd'])


@router.get('/sources', response=list[SourceOut])
def list_sources(request):
    return list(SOURCES)


@router.get('/sources/{source_id}/graph', response=SchemaGraphOut)
def get_graph(request, source_id: str, namespace: str | None = None):
    return build_graph(source_id, namespace)


@router.get('/layouts/{source_id}/{namespace}', response=LayoutOut)
def read_layout(request, source_id: str, namespace: str):
    return get_layout(request.user, source_id, namespace)


@router.put('/layouts/{source_id}/{namespace}', response={204: None})
def write_layout(request, source_id: str, namespace: str, payload: LayoutIn):
    save_layout(
        request.user,
        source_id,
        namespace,
        # Back to plain dicts for the JSONField; the models existed to validate.
        {entity_id: position.dict() for entity_id, position in payload.positions.items()},
        payload.view_state.dict() if payload.view_state is not None else None,
    )
    return Status(204, None)
