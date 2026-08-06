"""Omni-ERD's API surface, mounted once at /api/omni-erd/.

Auth is applied at the mount in config/api.py (AppAccessAuth('omni-erd')) and
inherited by everything here, so every endpoint below needs a grant - staff
bypass. tests/test_api.py covers access control; tests/test_overrides_api.py covers the admin boundary.

Read-only with respect to any introspected database. It writes two of its own
tables, either side of a privilege boundary:

- a user's own diagram layout, writable by anyone holding the grant;
- the relationship overrides, which are global assertions about the schema and
  so need staff. Those live on `admin_api.admin_router`, mounted below at
  /admin. That router carries `AdminAuth()` on its own constructor and is
  mounted bare, deliberately: a nested router's own auth beats the auth it would
  inherit, so the boundary is stated where the endpoints are rather than set
  from here, and no endpoint can be added without it. admin_api.py says why at
  length.
"""

from ninja import Router
from ninja.responses import Status

from .admin_api import admin_router
from .schemas import LayoutIn, LayoutOut, SchemaGraphOut, SourceOut
from .services import build_graph, get_layout, save_layout
from .sources import SOURCES

router = Router(tags=['omni-erd'])

router.add_router('/admin', admin_router)


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
