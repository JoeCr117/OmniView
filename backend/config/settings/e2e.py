"""
Settings for the Playwright E2E suite. frontend/playwright.config.ts sets
DJANGO_SETTINGS_MODULE=config.settings.e2e for its webServer process, which
runs the e2e_bootstrap management command and then runserver on port 8100
(8000 belongs to the production container).

Production-like where it matters: the same Postgres server the app uses
(the compose `db` service - `docker compose -f docker/docker-compose.yml up -d db` is a prerequisite),
auth enforcement ON, and the real static export served the same way the
container serves it. Fully isolated where it matters more: everything lives
in a dedicated `omniview_e2e` database that e2e_bootstrap drops and
recreates, so the suite can never touch the real `omniview` database or the
production Data/ tree.
"""

from .base import *  # noqa: F403
from .base import BASE_DIR, REPO_ROOT, pg_database

# Marker the e2e_bootstrap command checks before dropping E2E_DATABASE_NAME -
# it refuses to run under any other settings module.
IS_E2E = True

# Scratch dir: kept as the (deliberately pipeline-less) pipeline root below.
E2E_SCRATCH_DIR = BASE_DIR / '.e2e'

# The logins the bootstrap command creates and the specs sign in with
# (mirrored in frontend/e2e/helpers.ts). `e2e` is a regular user granted
# expense-tracker; `e2e-admin` is staff (sees the Admin Portal).
E2E_USERNAME = 'e2e'
E2E_PASSWORD = 'e2e-password!'
E2E_ADMIN_USERNAME = 'e2e-admin'
E2E_ADMIN_PASSWORD = 'e2e-admin-password!'

# Same server/credentials as dev (PG* env vars / compose defaults), but a
# separate database so drop/recreate is total isolation.
E2E_DATABASE_NAME = 'omniview_e2e'

DATABASES = {
    'default': {**pg_database('omniview,public'), 'NAME': E2E_DATABASE_NAME},
    'datavault': {**pg_database('datavault', conn_max_age=0), 'NAME': E2E_DATABASE_NAME},
}

# A rebuild triggered from the UI would run the real pipeline - which reads the
# PG* env vars directly, and those point at a real database. Rooting it at the
# scratch dir (which contains no `pipelines` package) makes `python -m
# pipelines.expense_tracker.main` fail to import instead of running.
PIPELINE_ROOT = E2E_SCRATCH_DIR

# The real export - `npm run e2e` runs `next build` first.
FRONTEND_EXPORT_DIR = REPO_ROOT / 'frontend' / 'out'

# The suite exercises the real login flow. Pinned (not env-read) so machine
# env vars can't flip enforcement off or wire up a real Entra tenant.
OMNIVIEW_AUTH_REQUIRED = True
AZURE_CLIENT_ID = ''
AZURE_AUTO_LOGIN = False
SOCIALACCOUNT_PROVIDERS = {}
