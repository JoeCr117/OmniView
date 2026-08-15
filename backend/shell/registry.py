"""The one list of OmniView's apps.

Everything the backend needs to know about which apps exist is derived from
here: INSTALLED_APPS (config/settings/base.py), the API router mounts and their
auth (config/api.py), datavault DB routing (config/db_router.py), the grantable
app ids the Admin Portal offers (apps/admin_portal/models.py), and the legacy
URL redirects (config/frontend.py). Before this module those were four separate
hand-maintained lists that nothing kept in agreement.

Registering an app is one import and one line in OMNIVIEW_APPS. The app itself
declares what it needs in its own omniview_app.py; see shell/appspec.py for the
shape, and docs/ARCHITECTURE.md for the full checklist.

The mirror of this list on the frontend is frontend/src/apps/registry.ts (which
also carries icons and nav, and so can't simply be generated from here).
shell/tests/test_registry.py asserts the two agree on ids.
"""

from apps.admin_portal.omniview_app import APP as ADMIN_PORTAL
from apps.expense_tracker.omniview_app import APP as EXPENSE_TRACKER
from apps.omni_erd.omniview_app import APP as OMNI_ERD

from shell.appspec import OmniViewApp

OMNIVIEW_APPS: tuple[OmniViewApp, ...] = (
    EXPENSE_TRACKER,
    OMNI_ERD,
    ADMIN_PORTAL,
)

APPS_BY_ID = {app.id: app for app in OMNIVIEW_APPS}

#: Dotted paths for INSTALLED_APPS, in registry order.
DJANGO_APPS: tuple[str, ...] = tuple(dotted for app in OMNIVIEW_APPS for dotted in app.django_apps)

#: App labels whose unmanaged models read from the datavault schema.
DATAVAULT_APPS: frozenset[str] = frozenset(
    label for app in OMNIVIEW_APPS for label in app.datavault_labels
)

#: App ids an admin may grant to a user (the Admin Portal itself is not one).
GRANTABLE_APP_IDS: frozenset[str] = frozenset(app.id for app in OMNIVIEW_APPS if app.grantable)

#: Pre-OmniView page name -> where it lives now.
LEGACY_REDIRECTS: dict[str, str] = {
    page: f'{app.base_path}/{page}' for app in OMNIVIEW_APPS for page in app.legacy_pages
}
