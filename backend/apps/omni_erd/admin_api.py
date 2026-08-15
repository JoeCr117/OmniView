"""The staff-only half of Omni-ERD: reading and writing relationship overrides.

An override is global and asserts a fact about the schema, so writing one takes
admin privilege - `AppAccessAuth('omni-erd')`, which the rest of the app runs
behind, grants *use* of the app and is not the same thing. Reading is admin-only
too: this list carries audit identity and rows that have gone stale, both of
which are admin bookkeeping. A non-admin already sees every override that
applies, as edges on the diagram, with origin, confidence, note and both ends.

The boundary is a router with its own auth, and that shape is load-bearing twice
over:

- **Declared here, where the endpoints are.** `Router.add_router(prefix, child,
  auth=...)` assigns to the child router in place, so a boundary set at the
  mount is a boundary another module can silently undo. `api.py` mounts this
  bare.
- **A router, not per-operation `auth=`.** A forgotten per-operation kwarg does
  not fail closed - it falls back to the parent's `AppAccessAuth` and hands
  writes to every granted user. An endpoint defined on `admin_router` cannot
  forget.

`AdminAuth` stands down entirely when `OMNIVIEW_AUTH_REQUIRED` is off, like
every other auth class in the shell. That is the documented local-work escape
hatch, not a gap here.

The endpoints bind, call and return. Every rule about what an override may say -
the source and namespace allowlist, the canonical ordering of the pair, the
column-pairing 422s, the duplicate pair, the audit identity and the graph cache -
lives in services.py, which is also where the diagram itself reads them from.
"""

from ninja import Router
from ninja.responses import Status
from shell.security import AdminAuth

from .schemas import OverrideIdOut, RelationshipOverrideIn, RelationshipOverrideOut
from .services import delete_override, list_overrides, save_override, update_override

admin_router = Router(tags=['omni-erd'], auth=AdminAuth())


@admin_router.get('/overrides', response=list[RelationshipOverrideOut])
def list_relationship_overrides(request, source_id: str, namespace: str | None = None):
    return list_overrides(source_id, namespace)


@admin_router.post('/overrides', response=OverrideIdOut)
def create_relationship_override(request, payload: RelationshipOverrideIn):
    return save_override(
        request.user,
        payload.source_id,
        payload.namespace,
        source_entity=payload.source_entity,
        source_columns=payload.source_columns,
        target_entity=payload.target_entity,
        target_columns=payload.target_columns,
        action=payload.action,
        cardinality=payload.cardinality,
        note=payload.note,
    )


@admin_router.put('/overrides/{override_id}', response=OverrideIdOut)
def edit_relationship_override(request, override_id: int, payload: RelationshipOverrideIn):
    return update_override(
        request.user,
        override_id,
        payload.source_id,
        payload.namespace,
        source_entity=payload.source_entity,
        source_columns=payload.source_columns,
        target_entity=payload.target_entity,
        target_columns=payload.target_columns,
        action=payload.action,
        cardinality=payload.cardinality,
        note=payload.note,
    )


@admin_router.delete('/overrides/{override_id}', response={204: None})
def remove_relationship_override(
    request, override_id: int, source_id: str, namespace: str | None = None
):
    delete_override(source_id, namespace, override_id)
    return Status(204, None)
