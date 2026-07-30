"""Omni-ERD's declaration to the OmniView shell."""

from shell.appspec import OmniViewApp

APP = OmniViewApp(
    id='omni-erd',
    router='apps.omni_erd.api.router',
    django_apps=('apps.omni_erd',),
    # No datavault_labels: Omni-ERD reads the datavault *catalog* with raw SQL
    # rather than mapping its tables, and its own ErdLayout model is managed and
    # belongs in `omniview` (a rebuild drops datavault wholesale).
    #
    # Grantable rather than admin_only - but grant it deliberately: it exposes
    # every table and column *name* in the schemas it can reach. Not their
    # contents; this app never issues a SELECT against user data.
)
