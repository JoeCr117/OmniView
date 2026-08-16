"""
Postgres connection settings for the pipeline side of the repo, read from the
libpq-standard PG* env vars.

Single source of naming truth with the web side: the defaults here MUST match
backend/config/settings/base.py:pg_database and
pipelines/expense_tracker/dbt/profiles.yml - all three read the same env vars so
one deployment configures one database.
"""

__all__ = ['DATAVAULT_SCHEMA', 'OMNIVIEW_SCHEMA', 'pg_engine']

import os

from sqlalchemy import create_engine
from sqlalchemy.engine import URL, Engine

DATAVAULT_SCHEMA = 'datavault'
OMNIVIEW_SCHEMA = 'omniview'


def pg_engine() -> Engine:
    url = URL.create(
        'postgresql+psycopg',
        username=os.environ.get('PGUSER', 'omniview'),
        password=os.environ.get('PGPASSWORD', 'omniview-dev'),
        host=os.environ.get('PGHOST', '127.0.0.1'),
        port=int(os.environ.get('PGPORT', '5432')),
        database=os.environ.get('PGDATABASE', 'omniview'),
        query={'sslmode': os.environ.get('PGSSLMODE', 'prefer')},
    )
    return create_engine(url)
