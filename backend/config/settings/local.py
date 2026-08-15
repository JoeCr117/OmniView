"""
Local development/production settings. One Postgres database (the compose
`db` service by default), two schemas:

- `default` -> schema `omniview`: Django's own tables (auth, sessions, admin)
  plus the managed source-data tables. Survives pipeline rebuilds.
- `datavault` -> schema `datavault`: the dbt-built tables (stg_*/bronze/
  silver/gold), read via unmanaged models (config/db_router.py routes the
  ExpenseTracker apps here; migrations never run against it).

Connection details come from the libpq-standard PG* env vars (see
base.pg_database); defaults match docker/docker-compose.yml's `db` service.
"""

from .base import *  # noqa: F403
from .base import REPO_ROOT, pg_database

DATABASES = {
    'default': pg_database('omniview,public'),
    # CONN_MAX_AGE=0 stays explicit: the rebuild endpoint drops and recreates
    # the datavault tables mid-request, so no connection may linger across
    # requests holding locks on them.
    'datavault': pg_database('datavault', conn_max_age=0),
}

# Where the rebuild endpoint launches the pipeline from (source data lives
# in the omniview schema since P2 - RawFile/BudgetMapDocument rows).
PIPELINE_ROOT = REPO_ROOT

# Next.js static export output (Milestone 10). In the Docker image this gets
# copied into the image at build time instead (see docker/Dockerfile); locally we
# serve straight from frontend/out/ once `npm run build` has been run there.
FRONTEND_EXPORT_DIR = REPO_ROOT / 'frontend' / 'out'

CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]
# The dev pair (next dev on :3000 -> Django on :8000) is cross-origin, so the
# browser only sends/accepts the session + CSRF cookies with credentials
# allowed and the origin trusted for CSRF.
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]
