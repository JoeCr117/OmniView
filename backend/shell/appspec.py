"""What an OmniView app has to tell the shell about itself.

The shell knows nothing about any particular app. It knows this shape - and
everything it needs to wire an app up (its Django apps, its API namespace and
who may reach it, which of its tables dbt owns, which pre-OmniView URLs still
point at it) is declared once, by the app, in its own `omniview_app.py`.

Kept free of Django imports so config/settings and config/db_router can read it
during startup, before the app registry is populated.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class OmniViewApp:
    """One app in the OmniView dashboard."""

    #: Kebab-case, stable. The URL namespace (/apps/<id>, /api/<id>), the
    #: AppAccess grant key, and the `id` in frontend/src/apps/registry.ts are
    #: all this string - test_registry.py asserts the two registries agree.
    id: str

    #: Dotted path to the ninja Router serving /api/<id>/.
    router: str

    #: Dotted paths of the Django apps this OmniView app owns, in
    #: INSTALLED_APPS order. Their *labels* are pinned and must not track these
    #: paths - see apps/expense_tracker/budgets/apps.py.
    django_apps: tuple[str, ...] = ()

    #: Labels of those Django apps holding unmanaged models over dbt gold
    #: tables. Routes their reads to the `datavault` alias and keeps migrations
    #: off it (config/db_router.py).
    datavault_labels: frozenset[str] = field(default_factory=frozenset)

    #: Staff-only (Admin Portal). Never grantable: it is gated by AdminAuth
    #: rather than by a per-user AppAccess row.
    admin_only: bool = False

    #: Pre-OmniView page names that must 301 into this app's namespace. The
    #: static export cannot express redirects, so Django answers them.
    legacy_pages: tuple[str, ...] = ()

    #: Optional dotted path to a `register_errors(api)` hook, for apps whose
    #: endpoints need their own exception -> HTTP mapping.
    errors: str | None = None

    @property
    def grantable(self) -> bool:
        return not self.admin_only

    @property
    def api_prefix(self) -> str:
        return f'/{self.id}'

    @property
    def base_path(self) -> str:
        return f'/apps/{self.id}'
