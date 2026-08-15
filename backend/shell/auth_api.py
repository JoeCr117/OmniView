"""
Session auth endpoints at /api/auth.

Every operation here declares `auth=None` so the endpoints stay reachable
when the API-wide SessionAuthWhenRequired gate is active (you must be able to
log in while logged out). CSRF is enforced manually on the unsafe methods via
ninja's own check_csrf, because opting out of the auth class also opts out of
its CSRF check.

django-ninja quirk (pinned in CLAUDE.md/HANDOFF.md): request bodies must be
explicit Schema classes — a bare `dict` parameter silently binds as query.
"""

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.views.decorators.csrf import ensure_csrf_cookie
from ninja import Router, Schema
from ninja.decorators import decorate_view
from ninja.errors import HttpError
from ninja.responses import Status
from ninja.utils import check_csrf

# Auth events (login/logout/failure) are logged by shell/signals.py via
# Django's built-in auth signals, which authenticate()/django_login()/
# django_logout() fire - do not also log them here.
router = Router(tags=['auth'])


class LoginIn(Schema):
    username: str
    password: str


class UserOut(Schema):
    username: str
    email: str
    first_name: str
    last_name: str
    is_staff: bool
    # Dashboard apps this user has been granted (AppAccess) -
    # the frontend registry filter's contract. Staff see every app
    # regardless, so this list matters for non-staff only.
    app_ids: list[str]

    @staticmethod
    def resolve_app_ids(obj) -> list[str]:
        return sorted(obj.app_access.values_list('app_id', flat=True))


class ErrorOut(Schema):
    detail: str


class ConfigOut(Schema):
    auth_required: bool
    azure_enabled: bool
    azure_auto_login: bool
    # Sign-in fully managed outside the app (Databricks identity headers):
    # the frontend hides Sign out when set.
    sso_managed: bool


class SessionOut(Schema):
    """Everything the shell needs to paint, in one response.

    The three legacy probes (/config -> /csrf -> /me) are strictly serial - the
    SPA can't send the next until the last returns - so the shell used to wait
    three round-trips before it could render. This bundles the public config and
    the current user (null when signed out), and @ensure_csrf_cookie on the view
    sets the csrftoken cookie in the same response, collapsing all three into one.
    """

    config: ConfigOut
    user: UserOut | None


def _enforce_csrf(request):
    if check_csrf(request) is not None:
        raise HttpError(403, 'CSRF check failed')


@router.get('/csrf', auth=None, response={204: None})
@decorate_view(ensure_csrf_cookie)
def get_csrf(request):
    """Sets the csrftoken cookie so the SPA can send X-CSRFToken headers."""
    return Status(204, None)


@router.post('/login', auth=None, response={200: UserOut, 401: ErrorOut})
def login(request, payload: LoginIn):
    _enforce_csrf(request)
    user = authenticate(request, username=payload.username, password=payload.password)
    if user is None:
        return Status(401, {'detail': 'Invalid username or password.'})
    # Rotates the CSRF token: clients must re-fetch /api/auth/csrf afterwards.
    django_login(request, user)
    return Status(200, user)


@router.post('/logout', auth=None, response={204: None})
def logout(request):
    _enforce_csrf(request)
    django_logout(request)
    return Status(204, None)


@router.get('/me', auth=None, response={200: UserOut, 401: ErrorOut})
def me(request):
    if not request.user.is_authenticated:
        return Status(401, {'detail': 'Not authenticated.'})
    return Status(200, request.user)


@router.get('/config', auth=None, response=ConfigOut)
def auth_config(request):
    """Public flags the static login page needs before anyone is signed in."""
    return _config_payload()


@router.get('/session', auth=None, response=SessionOut)
@decorate_view(ensure_csrf_cookie)
def session(request):
    """Config + current user + a fresh csrftoken cookie, in one round-trip.

    Replaces the /config -> /csrf -> /me waterfall the AuthProvider ran on
    mount. The three endpoints stay for compatibility (and CSRF re-fetch after
    login/logout, when only the token needs refreshing).
    """
    user = request.user if request.user.is_authenticated else None
    return {'config': _config_payload(), 'user': user}


def _config_payload() -> dict:
    return {
        'auth_required': settings.OMNIVIEW_AUTH_REQUIRED,
        'azure_enabled': bool(settings.AZURE_CLIENT_ID),
        'azure_auto_login': settings.AZURE_AUTO_LOGIN,
        'sso_managed': settings.SSO_MANAGED,
    }
