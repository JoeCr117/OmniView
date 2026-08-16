"""
Settings for the Databricks Apps deployment, backed by Lakebase (managed
Postgres). Selected via DJANGO_SETTINGS_MODULE in app.yaml.

Differences from local:
- DATABASES use the config.pg_lakebase engine: the Lakebase app resource
  injects PGHOST/PGDATABASE/PGUSER/PGPORT/PGSSLMODE but no PGPASSWORD, so the
  backend mints a short-lived OAuth token per connection (cached ~40min).
  For local smoke tests of this module, set PGPASSWORD and it behaves like
  the stock postgres backend.
- Auth is delegated to Databricks' own OAuth front door: the proxy injects
  X-Forwarded-Email, and the RemoteUser middleware/backend pair signs that
  identity in (auto-creating users on first visit). SSO_MANAGED tells the
  frontend to hide Sign out (logging out of the app is meaningless behind
  the Databricks door).
"""

import os

from .base import *  # noqa: F403
from .base import MIDDLEWARE, REPO_ROOT, pg_database

DEBUG = False


def _lakebase(search_path: str, *, conn_max_age: int) -> dict:
    cfg = pg_database(search_path, conn_max_age=conn_max_age)
    cfg['ENGINE'] = 'config.pg_lakebase'
    if 'PGPASSWORD' not in os.environ:
        # Kill pg_database's local-dev fallback so the engine's token path
        # fires (on Databricks there is no password, only OAuth tokens).
        cfg['PASSWORD'] = ''
    return cfg


DATABASES = {
    # Token minting is amortized across requests via CONN_MAX_AGE; expiry is
    # enforced at login only, so a pooled connection outliving its token is
    # fine.
    'default': _lakebase('omniview,public', conn_max_age=300),
    # The rebuild endpoint drops/recreates datavault tables mid-request - no
    # connection may linger across requests holding locks on them.
    'datavault': _lakebase('datavault', conn_max_age=0),
}

# --- Identity-header auth (see shell/remote_auth.py for why this is safe
# here and only here) -------------------------------------------------------
MIDDLEWARE = MIDDLEWARE.copy()
MIDDLEWARE.insert(
    MIDDLEWARE.index('django.contrib.auth.middleware.AuthenticationMiddleware') + 1,
    'shell.remote_auth.ForwardedEmailMiddleware',
)

# ModelBackend stays so /admin/ password logins keep working for superusers.
AUTHENTICATION_BACKENDS = [
    'shell.remote_auth.ForwardedEmailBackend',
    'django.contrib.auth.backends.ModelBackend',
]

SSO_MANAGED = True

# --- Proxy/host hygiene -----------------------------------------------------
# The Databricks proxy terminates TLS; trust its proto header so Django
# treats requests as secure (CSRF origin checks, secure cookies).
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# app.yaml sets OMNIVIEW_APP_URL to the app's public URL
# (https://<app>-<id>.<region>.databricksapps.com). Without it, fall back to
# base.py's permissive ALLOWED_HOSTS (the Databricks proxy is the only route
# in anyway).
#
# The proxy terminates the public hostname and forwards with
# Host: localhost:<port>, so localhost must be allowed or every request 400s
# (django.security.DisallowedHost). Browsers still send the public https
# Origin on writes, which no longer matches the localhost request host -
# CSRF_TRUSTED_ORIGINS carries the public URL so those pass.
_app_url = os.environ.get('OMNIVIEW_APP_URL', '').rstrip('/')
if _app_url:
    ALLOWED_HOSTS = [_app_url.split('://', 1)[-1], 'localhost', '127.0.0.1']
    CSRF_TRUSTED_ORIGINS = [_app_url]

# The bundle ships the static export at <bundle root>/frontend/out (same
# relative layout as the repo - see deploy/databricks/build_app.py in P5).
FRONTEND_EXPORT_DIR = REPO_ROOT / 'frontend' / 'out'
PIPELINE_ROOT = REPO_ROOT

# Same-origin only - no cross-origin dev frontend in this deployment.
CORS_ALLOWED_ORIGINS: list[str] = []
CORS_ALLOW_CREDENTIALS = False
