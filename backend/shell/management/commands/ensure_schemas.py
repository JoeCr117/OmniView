"""
Creates the `omniview` and `datavault` schemas if they don't exist yet.

Runs before the first `migrate` (docker/entrypoint.sh / databricks_start.py):
the default alias's search_path starts with `omniview`, so migrate would
otherwise create Django's tables in `public`. Doubles as the entrypoint's
wait-for-db probe - it exits nonzero while Postgres is still starting.
"""

from django.core.management.base import BaseCommand
from django.db import connections

SCHEMAS = ('omniview', 'datavault')


class Command(BaseCommand):
    help = 'Create the omniview/datavault schemas if missing (idempotent).'

    def handle(self, *args, **options):
        connection = connections['default']
        if connection.vendor != 'postgresql':
            self.stdout.write(
                f'Skipping: default DB vendor is {connection.vendor!r}, not postgresql.'
            )
            return
        with connection.cursor() as cursor:
            for schema in SCHEMAS:
                cursor.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
        self.stdout.write(f'Schemas ensured: {", ".join(SCHEMAS)}')
