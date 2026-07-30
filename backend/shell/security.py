"""
API-wide auth for the OmniView NinjaAPI.

django-ninja 1.x has no `NinjaAPI(csrf=...)` argument anymore: CSRF is
enforced by cookie-based auth classes themselves (`APIKeyCookie(csrf=True)`,
which `SessionAuth` inherits). So attaching this class as the global API auth
gives both session authentication and CSRF checking on unsafe methods.
"""

from django.conf import settings
from ninja.errors import HttpError
from ninja.security import SessionAuth


class SessionAuthWhenRequired(SessionAuth):
    """Session auth (with CSRF) that only engages when OMNIVIEW_AUTH_REQUIRED.

    The flag is read per-request (not at import) so tests can flip it with
    override_settings and deployments can flip it with the env var without
    code changes. When the flag is off, every request passes — M4 behavior:
    no auth, no CSRF on the API.
    """

    def __call__(self, request):
        if not settings.OMNIVIEW_AUTH_REQUIRED:
            # AnonymousUser is truthy, so this always authenticates; ninja
            # stores it as request.auth.
            return request.user
        return super().__call__(request)


class AdminAuth(SessionAuthWhenRequired):
    """Session auth + staff requirement, for the Admin Portal router.

    401 keeps meaning "not signed in" (base class returns None); a signed-in
    non-staff user gets an explicit 403 (raised HttpErrors route through
    ninja's exception handlers). The OMNIVIEW_AUTH_REQUIRED=0 escape hatch
    disables this check like every other auth check.
    """

    def __call__(self, request):
        user = super().__call__(request)
        if user is None or not settings.OMNIVIEW_AUTH_REQUIRED:
            return user
        if user.is_staff:
            return user
        raise HttpError(403, 'Admin access required.')


class AppAccessAuth(SessionAuthWhenRequired):
    """Session auth + per-user app grant, for dashboard-app routers.

    Access is deny-by-default (see apps.admin_portal.models.AppAccess): a signed-in
    user needs a grant row for this app id unless they are staff (admins see
    everything). Mounted per-router in config/api.py:
    add_router(..., auth=AppAccessAuth('<app-id>')).
    """

    def __init__(self, app_id: str):
        self.app_id = app_id
        super().__init__()

    def __call__(self, request):
        user = super().__call__(request)
        if user is None or not settings.OMNIVIEW_AUTH_REQUIRED:
            return user
        if user.is_staff:
            return user
        # Imported lazily: this module loads from config/api.py at startup,
        # before the app registry is guaranteed ready for model imports.
        from apps.admin_portal.models import AppAccess

        if AppAccess.objects.filter(user_id=user.pk, app_id=self.app_id).exists():
            return user
        raise HttpError(403, 'You do not have access to this app.')
