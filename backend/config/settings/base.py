"""
Database-agnostic Django settings shared by every environment.
Environment-specific settings (local compose Postgres, Databricks Lakebase,
test/e2e) live in sibling modules and are selected via the
DJANGO_SETTINGS_MODULE env var.
"""

import os
from pathlib import Path
from typing import Any

from shell.registry import DJANGO_APPS

# backend/config/settings/base.py -> BASE_DIR = backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent
# REPO_ROOT is one level above backend/, where Data/ and pipelines/ live.
REPO_ROOT = BASE_DIR.parent


def _env_flag(name: str, default: str = '') -> bool:
    return os.environ.get(name, default).strip().lower() in {'1', 'true', 'yes', 'on'}


def pg_database(search_path: str, *, conn_max_age: int = 0) -> dict:
    """
    DATABASES entry for the deployment's Postgres server, read from the
    libpq-standard PG* env vars - the same names a Databricks Apps Lakebase
    resource injects (PGHOST/PGDATABASE/PGUSER/PGPORT/PGSSLMODE). A deployment
    is one Postgres database; the `default` and `datavault` aliases differ
    only by search_path (schemas `omniview` and `datavault`, created by
    `manage.py ensure_schemas` before the first migrate).

    The dev fallbacks match docker/docker-compose.yml's `db` service so a bare
    `runserver` on the host works with `docker compose -f docker/docker-compose.yml up -d db` and nothing
    else configured.
    """
    options = {'options': f'-c search_path={search_path}'}
    sslmode = os.environ.get('PGSSLMODE')
    if sslmode:
        options['sslmode'] = sslmode
    return {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('PGDATABASE', 'omniview'),
        'HOST': os.environ.get('PGHOST', '127.0.0.1'),
        'PORT': os.environ.get('PGPORT', '5432'),
        'USER': os.environ.get('PGUSER', 'omniview'),
        'PASSWORD': os.environ.get('PGPASSWORD', 'omniview-dev'),
        'CONN_MAX_AGE': conn_max_age,
        'OPTIONS': options,
    }


# Insecure fallback keeps local dev zero-config; the Docker deployment sets
# SECRET_KEY explicitly (see docs/DEPLOYMENT.md).
SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-#k4s2(groyk7=d3yy)lg+!3%^24=9x7y1uc0y3wd(#z#gs41jq',
)

DEBUG = True

ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'ninja',
    # django-allauth: only for the Microsoft Entra ID redirect flow (M7);
    # password sessions stay on the first-party /api/auth router. The sites
    # framework is NOT required (allauth checks apps.is_installed and falls
    # back to SocialApp.objects.all()).
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.microsoft',
    # The OmniView shell: auth API, log ingestion, security, the app registry.
    'shell',
    # ...and every registered dashboard app's Django apps. Sourced from
    # shell/registry.py so adding an app doesn't mean editing settings.
    *DJANGO_APPS,
]

MIDDLEWARE = [
    # First so every request (even ones short-circuited by later middleware)
    # gets an X-Request-ID and a log line covering the whole stack's time.
    'config.middleware.RequestLogMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # Required by allauth (its AppConfig.ready() raises without it).
    'allauth.account.middleware.AccountMiddleware',
]

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
    'allauth.account.auth_backends.AuthenticationBackend',
]

ROOT_URLCONF = 'config.urls'

# Django's clickjacking middleware defaults to DENY, which blocks the Admin
# Portal's own /apps/admin-portal/api-docs page from embedding the Swagger UI
# (/api/docs) in an iframe.
# SAMEORIGIN keeps cross-site framing blocked while allowing our own.
X_FRAME_OPTIONS = 'SAMEORIGIN'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        # backend/templates/ holds project-level overrides of third-party app
        # templates (currently ninja/swagger.html for Swagger dark mode).
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
# Static files (Next.js's static export) get collected here from STATICFILES_DIRS
# in the environment settings once the frontend has been built (see Milestone 10).

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ---------------------------------------------------------------------------
# Auth. Django's own tables (auth, sessions, admin) live in the `default`
# database (Data/OmniView/omniview.db locally); the ExpenseTracker apps'
# unmanaged models read the dbt gold tables from the `datavault` alias, which
# the pipeline deletes and rebuilds - the router keeps migrations away from it.
# OMNIVIEW_AUTH_REQUIRED defaults ON since M6 (the login UI exists): the API
# requires a session (+ CSRF on writes) and /api/docs + HTML pages redirect
# to /login. Set OMNIVIEW_AUTH_REQUIRED=0 as the escape hatch to run open.
# ---------------------------------------------------------------------------
DATABASE_ROUTERS = ['config.db_router.OmniViewDBRouter']

LOGIN_URL = '/login'

OMNIVIEW_AUTH_REQUIRED = _env_flag('OMNIVIEW_AUTH_REQUIRED', default='1')

# True only on deployments where sign-in is handled entirely outside the app
# (Databricks identity headers): the frontend then hides Sign out, since the
# platform's front door would immediately sign the user back in.
SSO_MANAGED = False

# OmniView admins: comma-separated emails. Matching users (case-insensitive)
# are promoted to is_staff on header sign-in (shell/remote_auth.py); admins can
# also promote others from the Admin Portal. Staff bypass per-app access
# checks and are the only users who can open the Admin Portal.
OMNIVIEW_ADMIN_EMAILS = [
    email.strip().lower()
    for email in os.environ.get('OMNIVIEW_ADMIN_EMAILS', '').split(',')
    if email.strip()
]

# SQL warehouse the Admin Portal's cost dashboards query system.billing
# through (SQL Statement Execution API). Empty = costs show "not connected".
OMNIVIEW_SQL_WAREHOUSE_ID = os.environ.get('OMNIVIEW_SQL_WAREHOUSE_ID', '')

# Where allauth sends the browser after a completed Microsoft round-trip
# when no ?next= was carried through the flow.
LOGIN_REDIRECT_URL = '/'

# ---------------------------------------------------------------------------
# Azure Entra ID SSO (M7), entirely env-driven - no SocialApp DB rows.
# AZURE_CLIENT_ID/AZURE_AUTO_LOGIN are exposed via GET /api/auth/config so the
# static login page knows whether to show/auto-trigger the Microsoft button.
# Redirect URI to register in Entra: https://<host>/accounts/microsoft/login/callback/
# ---------------------------------------------------------------------------
AZURE_CLIENT_ID = os.environ.get('AZURE_CLIENT_ID', '')
AZURE_CLIENT_SECRET = os.environ.get('AZURE_CLIENT_SECRET', '')
AZURE_TENANT_ID = os.environ.get('AZURE_TENANT_ID', 'common')
AZURE_AUTO_LOGIN = _env_flag('AZURE_AUTO_LOGIN')

# The login page's Microsoft button is a plain GET anchor - initiate the
# redirect on GET instead of rendering allauth's interstitial confirm page.
SOCIALACCOUNT_LOGIN_ON_GET = True

# No email backend is configured; the default ("optional") would try to send
# a verification mail when a first Microsoft login auto-creates the user.
ACCOUNT_EMAIL_VERIFICATION = 'none'

# Entra ID is the user's own tenant, so it is fully trusted: a Microsoft
# login whose (provider-verified) email matches an existing local account
# signs into that account and permanently connects the social account to it,
# instead of bouncing to a duplicate-email signup form.
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True

SOCIALACCOUNT_PROVIDERS = {}
if AZURE_CLIENT_ID:
    SOCIALACCOUNT_PROVIDERS['microsoft'] = {
        'APPS': [
            {
                'client_id': AZURE_CLIENT_ID,
                'secret': AZURE_CLIENT_SECRET,
                'settings': {'tenant': AZURE_TENANT_ID},
            }
        ]
    }

# ---------------------------------------------------------------------------
# Logging: everything to stdout, where both the dev console and `docker logs`
# pick it up. LOG_LEVEL env var tunes verbosity (DEBUG/INFO/WARNING/ERROR).
# First-party code logs under the `omniview.*` namespace, e.g.
# logging.getLogger('omniview.pipeline'). Setting LOG_DIR additionally writes
# a rotating file log there (*.log is gitignored).
# Note: Django applies its DEFAULT_LOGGING first, so `django.server`
# (runserver's request lines) keeps its own handler/format; everything else
# propagates to the root console handler below.
# ---------------------------------------------------------------------------
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()

#: Annotated because the block below reaches into it: a bare literal infers its
#: values as `object`, which is not indexable or appendable.
LOGGING: dict[str, Any] = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        # Stamps every record with the current request's ID ('-' outside a
        # request). The middleware mints the ID; the filter just reads it.
        'request_id': {'()': 'config.middleware.RequestIdFilter'},
    },
    'formatters': {
        'console': {
            'format': '{asctime} {levelname} [{name}] [{request_id}] {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'console',
            'filters': ['request_id'],
        },
    },
    'root': {
        'handlers': ['console'],
        'level': LOG_LEVEL,
    },
    'loggers': {
        'django': {'level': LOG_LEVEL},
        'omniview': {'level': LOG_LEVEL},
    },
}

_LOG_DIR = os.environ.get('LOG_DIR')
if _LOG_DIR:
    LOGGING['handlers']['file'] = {
        'class': 'logging.handlers.RotatingFileHandler',
        'filename': str(Path(_LOG_DIR) / 'omniview.log'),
        'maxBytes': 5 * 1024 * 1024,
        'backupCount': 3,
        'formatter': 'console',
        'filters': ['request_id'],
    }
    LOGGING['root']['handlers'].append('file')
