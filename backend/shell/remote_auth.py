"""
Header-based auto-login for deployments behind the Databricks Apps proxy.

Nothing reaches the app except through Databricks' own OAuth front door,
which injects the caller's identity as X-Forwarded-Email (plus
X-Forwarded-Preferred-Username / X-Forwarded-User). Trusting that header is
the standard Django RemoteUser pattern: the middleware logs the user in (and
persists the session), the backend auto-creates unknown users on first visit.

Wired up ONLY in config.settings.databricks - local deployments keep the
password/Entra login and must never load this middleware (a spoofed
X-Forwarded-Email header would be an auth bypass without the trusted proxy
in front).
"""

from django.conf import settings
from django.contrib.auth.backends import RemoteUserBackend
from django.contrib.auth.middleware import PersistentRemoteUserMiddleware


class ForwardedEmailMiddleware(PersistentRemoteUserMiddleware):
    header = 'HTTP_X_FORWARDED_EMAIL'


class ForwardedEmailBackend(RemoteUserBackend):
    create_unknown_user = True

    def configure_user(self, request, user, created=True):
        update_fields = []
        # The Databricks identity is an email address; mirror it into the
        # email field on first login so the UI has something to show.
        if created and '@' in user.username:
            user.email = user.username
            update_fields.append('email')
        # OMNIVIEW_ADMIN_EMAILS auto-promotion. Runs on every header
        # (re)login, not just creation, so adding an email to the env
        # promotes that user on their next sign-in. Never demotes - removals
        # are handled explicitly in the Admin Portal.
        if not user.is_staff and user.username.lower() in settings.OMNIVIEW_ADMIN_EMAILS:
            user.is_staff = True
            update_fields.append('is_staff')
        if update_fields:
            user.save(update_fields=update_fields)
        return user
