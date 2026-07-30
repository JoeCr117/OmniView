"""
Prepares the isolated environment for the Playwright E2E suite. Invoked by
frontend/playwright.config.ts's webServer command (under config.settings.e2e)
right before runserver starts.

Drops and recreates the dedicated `omniview_e2e` Postgres database on the
compose `db` server, migrates it, creates the `e2e` logins and grants - so the
suite behaves like a real deployment without ever touching the real `omniview`
database or the production Data/ directory.

Seeding each app's *data* is that app's business, not the shell's: this command
only knows which apps to ask (via the registry), and the app supplies the rows.
"""

import shutil

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connections


class Command(BaseCommand):
    help = 'Drop and rebuild the omniview_e2e database for Playwright.'

    def handle(self, *args, **options):
        if not getattr(settings, 'IS_E2E', False):
            raise CommandError(
                'e2e_bootstrap only runs under config.settings.e2e - it drops '
                'the database the settings point at.'
            )

        self._recreate_database()

        # Wiped for cleanliness; kept existing as the (pipeline-less) rebuild
        # fail-fast root - see PIPELINE_ROOT in settings/e2e.py.
        scratch = settings.E2E_SCRATCH_DIR
        shutil.rmtree(scratch, ignore_errors=True)
        scratch.mkdir(parents=True)

        call_command('ensure_schemas')
        call_command('migrate', interactive=False, verbosity=0)
        from apps.admin_portal.models import AppAccess

        user = get_user_model().objects.create_user(
            settings.E2E_USERNAME, 'e2e@example.com', settings.E2E_PASSWORD
        )
        admin = get_user_model().objects.create_user(
            settings.E2E_ADMIN_USERNAME,
            'e2e-admin@example.com',
            settings.E2E_ADMIN_PASSWORD,
            is_staff=True,
        )
        # Access is deny-by-default: the regular login needs its grant.
        AppAccess.objects.create(user=user, app_id='expense-tracker', granted_by=admin)

        # Imported here, not at module scope: the fixtures live under the app's
        # tests/, which the deploy bundle prunes. This command never runs in a
        # deployment (the IS_E2E guard above), but its module still gets
        # imported by `manage.py` command discovery, which must not blow up.
        from apps.expense_tracker.tests.fixtures import create_datavault_tables, seed_demo_data

        create_datavault_tables(connections['datavault'])
        seed_demo_data()
        self.stdout.write(f'E2E environment ready ({settings.E2E_DATABASE_NAME})')

    @staticmethod
    def _recreate_database():
        """Drop/recreate omniview_e2e via a maintenance connection to the
        real database (whose name the PG* env vars / defaults carry) - Django
        can't do it through its own connection because you cannot drop the
        database you're connected to."""
        import os

        import psycopg

        default = settings.DATABASES['default']
        e2e_name = settings.E2E_DATABASE_NAME
        try:
            conn = psycopg.connect(
                host=default['HOST'],
                port=default['PORT'],
                user=default['USER'],
                password=default['PASSWORD'],
                dbname=os.environ.get('PGDATABASE', 'omniview'),
                autocommit=True,
            )
        except psycopg.OperationalError as exc:
            raise CommandError(
                'Could not reach the Postgres server - the E2E suite needs the '
                'compose db service running: docker compose -f docker/docker-compose.yml up -d db '
                f'({exc})'
            ) from exc
        with conn:
            # FORCE kicks lingering connections from a crashed previous run.
            conn.execute(f'DROP DATABASE IF EXISTS "{e2e_name}" WITH (FORCE)')
            conn.execute(f'CREATE DATABASE "{e2e_name}"')

