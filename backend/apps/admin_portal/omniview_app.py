"""The Admin Portal's declaration to the OmniView shell."""

from shell.appspec import OmniViewApp

APP = OmniViewApp(
    id='admin-portal',
    router='apps.admin_portal.api.router',
    django_apps=('apps.admin_portal',),
    # Staff-gated rather than grantable, so it never appears in
    # GRANTABLE_APP_IDS and can't be handed to a user from its own Users tab.
    admin_only=True,
    # Its Databricks-backed endpoints (jobs/costs) map SDK failures onto
    # structured 503/403 responses the frontend keys its empty states off.
    errors='apps.admin_portal.errors',
    # Inherited from ExpenseTracker along with the page itself: the Swagger UI
    # covers every registered app's router, so it is a portal concern. The
    # route folder must stay named `api-docs` - shell/registry.py derives the
    # redirect target as `<base_path>/<page>`, so the page name IS the segment.
    legacy_pages=('api-docs',),
)
