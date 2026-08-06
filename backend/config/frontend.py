"""
Serves the Next.js static export from FRONTEND_EXPORT_DIR.
Each app-router page exports as both a directory and a sibling `<page>.html`
file (e.g. apps/expense-tracker/budget-map.html); this view maps a request
path to the matching static file, falling back to index.html for the root.
"""

from django.conf import settings
from django.contrib.auth.views import redirect_to_login
from django.http import Http404, HttpResponsePermanentRedirect
from django.views.static import serve

# Pre-OmniView URLs (bookmarks, the Power BI era's muscle memory). The static
# export can't express redirects itself (`redirects()` is unsupported with
# output: "export"), so Django answers them with a 301 to the app namespace.
# Which pages those are is each app's business (legacy_pages in its
# omniview_app.py); this view only knows how to serve the redirect.
from shell.registry import LEGACY_REDIRECTS  # noqa: F401  (re-exported for tests)

# Route prefixes, not app ids: Omni-ERD as a whole is grant-level, only its
# relationship editor is staff-only.
STAFF_ONLY_PAGE_PREFIXES = ("apps/admin-portal", "apps/omni-erd/relationships")


def _needs_login(request, resource: str) -> bool:
    """HTML page requests require a session when OMNIVIEW_AUTH_REQUIRED is on.

    Static assets always pass: the login page needs its own _next/ chunks and
    icons before anyone is authenticated, and hiding JS bundles isn't a
    security boundary anyway - the API is. Anything whose last path segment
    has a file extension is treated as an asset; extension-less paths are app
    router pages.
    """
    if not settings.OMNIVIEW_AUTH_REQUIRED or request.user.is_authenticated:
        return False
    if resource == "login" or resource.startswith("_next/"):
        return False
    return "." not in resource.rsplit("/", 1)[-1]


def _staff_only_page(request, resource: str) -> bool:
    """Staff-only routes 404 for signed-in non-staff (defense in depth - the
    API endpoints behind AdminAuth are the real boundary).

    Everything under one of these prefixes is gated, extension or not: the
    export writes each route as a directory plus sibling `<route>.html` and
    `<route>.txt` (the RSC payload), and puts no assets there - bundles live
    under _next/. Exempting anything with a file extension would hand the
    page shell and its flight data to anyone who appends one.
    """
    if not settings.OMNIVIEW_AUTH_REQUIRED:
        return False
    if not resource.startswith(STAFF_ONLY_PAGE_PREFIXES):
        return False
    return not request.user.is_staff


def frontend_view(request, resource: str = ""):
    root = settings.FRONTEND_EXPORT_DIR
    resource = resource.strip("/")

    if resource in LEGACY_REDIRECTS:
        return HttpResponsePermanentRedirect(LEGACY_REDIRECTS[resource])

    if _needs_login(request, resource):
        return redirect_to_login(request.get_full_path())

    if _staff_only_page(request, resource):
        raise Http404("Not found")

    if resource == "":
        return serve(request, "index.html", document_root=root)

    # Real static assets (e.g. _next/static/..., favicon.ico, *.svg) exist verbatim.
    if (root / resource).is_file():
        return serve(request, resource, document_root=root)

    # App router pages export as "<route>.html" alongside a same-named directory.
    html_candidate = f"{resource}.html"
    if (root / html_candidate).is_file():
        return serve(request, html_candidate, document_root=root)

    raise Http404(f"No static frontend asset for {resource!r}")
