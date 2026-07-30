from ninja import Router
from ninja.pagination import LimitOffsetPagination, paginate
from ninja.responses import Status

from .schemas import (
    AdminUserOut,
    CostsOverviewOut,
    JobsOverviewOut,
    PortalOverviewOut,
    SetAdminIn,
)
from .services import (
    costs_overview_for,
    grant_app,
    jobs_overview_for,
    portal_overview,
    revoke_app,
    set_admin,
    users_queryset,
)

router = Router(tags=['admin-portal'])


@router.get('/overview', response=PortalOverviewOut)
def get_portal_overview(request):
    return portal_overview(request)


@router.get('/jobs/overview', response=JobsOverviewOut)
def get_jobs_overview(request):
    return jobs_overview_for(request)


@router.get('/costs/overview', response=CostsOverviewOut)
def get_costs_overview(request, days: int = 30):
    return costs_overview_for(request, days)


@router.get('/users', response=list[AdminUserOut])
@paginate(LimitOffsetPagination)
def list_users(request, q: str | None = None):
    return users_queryset(q)


@router.post('/users/{user_id}/apps/{app_id}', response={204: None})
def grant_user_app(request, user_id: int, app_id: str):
    grant_app(user_id, app_id, granted_by=request.user)
    return Status(204, None)


@router.delete('/users/{user_id}/apps/{app_id}', response={204: None})
def revoke_user_app(request, user_id: int, app_id: str):
    revoke_app(user_id, app_id)
    return Status(204, None)


@router.post('/users/{user_id}/admin', response=AdminUserOut)
def set_user_admin(request, user_id: int, payload: SetAdminIn):
    return set_admin(user_id, payload.is_staff, acting_user=request.user)
