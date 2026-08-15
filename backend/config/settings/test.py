"""
Settings for the pytest suite (selected via DJANGO_SETTINGS_MODULE in the
root pyproject.toml's [tool.pytest.ini_options]).

Isolation is the whole point: databases are in-memory, and every filesystem
setting points at a sentinel path that does not exist, so any test that
forgets to override it fails loudly instead of reading or writing the real
Data/ tree - that directory is the user's production data. (Source data
itself lives in DB rows since P2; conftest.py's golden1_data fixture seeds
it per-test.)
"""

from django.db.backends.signals import connection_created
from django.dispatch import receiver

from .base import *  # noqa: F403
from .base import REPO_ROOT


@receiver(connection_created)
def _register_c_collation(connection, **kwargs):
    """Teach SQLite the `C` collation Postgres ships with.

    `ErdRelationshipOverride.entity_a`/`entity_b` pin `db_collation='C'` so the
    database orders an override's pair the way `services.canonical_pair` does.
    Stock SQLite knows only BINARY/NOCASE/RTRIM, so every migration on this tier -
    not just Omni-ERD's - dies with "no such collation sequence: C" without this.
    Registered per connection because a collation lives on the connection, not
    the file, and this tier's databases are in-memory and short-lived.

    The comparator is Python's own, which makes the equivalence exact rather
    than approximate: whatever `canonical_pair` calls ordered, the CHECK agrees.
    """
    if connection.vendor == 'sqlite':
        connection.connection.create_collation('C', lambda a, b: (a > b) - (a < b))


DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    },
    # In-memory stand-in for DataVault.db. Tests that read gold tables opt in
    # with @pytest.mark.django_db(databases=['default', 'datavault']) plus the
    # datavault_tables fixture (backend/conftest.py), which executes
    # backend/tests/fixtures/datavault_schema.sql - the models are unmanaged,
    # so migrations never create their tables.
    'datavault': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    },
}

# Sentinel: intentionally nonexistent, so a stray rebuild/page-serve attempt
# fails loudly instead of touching the real repo.
_TEST_SENTINEL = REPO_ROOT / '.pytest-sentinel-does-not-exist'

PIPELINE_ROOT = _TEST_SENTINEL
FRONTEND_EXPORT_DIR = _TEST_SENTINEL / 'out'

# Pinned off (and isolated from the machine's env): most tests exercise the
# open API; enforcement tests opt in via the auth_on fixture
# (config/tests/test_auth_enforcement.py). The real default is ON in base.py.
OMNIVIEW_AUTH_REQUIRED = False
AZURE_CLIENT_ID = ''
AZURE_AUTO_LOGIN = False
# base.py builds this from the machine's AZURE_* env vars - clear it so SSO
# tests always start unconfigured and opt in via override_settings.
SOCIALACCOUNT_PROVIDERS = {}
