from functools import wraps

from django.conf import settings
from django.contrib.auth.views import redirect_to_login
from django.utils.module_loading import import_string
from ninja import NinjaAPI

from shell.registry import OMNIVIEW_APPS
from shell.security import AdminAuth, AppAccessAuth, SessionAuthWhenRequired


def _docs_when_authorized(view):
    """Gate /api/docs + /api/openapi.json behind login when the flag is on.

    Reads the flag per-request (like SessionAuthWhenRequired) so tests and
    deployments can flip OMNIVIEW_AUTH_REQUIRED without re-importing this
    module.
    """

    @wraps(view)
    def wrapper(request, *args, **kwargs):
        if settings.OMNIVIEW_AUTH_REQUIRED and not request.user.is_authenticated:
            return redirect_to_login(request.get_full_path())
        return view(request, *args, **kwargs)

    return wrapper


api = NinjaAPI(
    title="OmniView API",
    auth=SessionAuthWhenRequired(),
    docs_decorator=_docs_when_authorized,
)

# Shell concerns own the top-level prefixes. /api/auth's endpoints declare
# auth=None individually - login must work logged out. /api/logs rides the
# API-wide auth (session required when the flag is on).
api.add_router("/auth", "shell.auth_api.router")
api.add_router("/logs", "shell.logs_api.router")

# Every dashboard app gets its own /api/<app-id>/ namespace, straight from the
# registry - the shell never names an app. Router-level auth overrides the API
# default and is inherited by the app's nested routers: dashboard apps require a
# per-user grant (deny-by-default, staff bypass), the Admin Portal requires
# staff. An app may also register its own exception handlers.
for app in OMNIVIEW_APPS:
    auth = AdminAuth() if app.admin_only else AppAccessAuth(app.id)
    api.add_router(app.api_prefix, app.router, auth=auth)
    if app.errors:
        import_string(f"{app.errors}.register_errors")(api)
