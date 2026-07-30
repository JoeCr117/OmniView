"""
Entry point for the Databricks Apps deployment (referenced by app.yaml's
command array - Apps runs it with no shell).

Waits for/prepares the database exactly like docker/entrypoint.sh
does locally (ensure schemas -> migrate), then execs gunicorn on
DATABRICKS_APP_PORT. The Lakebase resource injects PG*; passwords are minted
per-connection by config.pg_lakebase (see ENDPOINT_NAME in app.yaml).
"""

import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent / 'backend'


def main() -> None:
    # Apps launches this with a RELATIVE sys.executable (.venv/bin/python);
    # make it absolute before chdir or every subprocess call breaks. abspath,
    # NOT resolve(): resolving would follow the venv symlink out to the base
    # interpreter and lose every installed package.
    python = os.path.abspath(sys.executable)
    os.chdir(BACKEND)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.databricks')

    subprocess.run([python, 'manage.py', 'ensure_schemas'], check=True)
    subprocess.run([python, 'manage.py', 'migrate', '--noinput'], check=True)
    # Must follow migrate, and must run as the app: migrate creates new tables
    # owned by whichever service principal ran it, and a recreate mints a new
    # one that could then neither read nor drop them. Only the creator may
    # reassign, so this is the single moment it is possible. The dbt
    # on-run-end hook does the same for `datavault`.
    #
    # check=False deliberately. Ownership drift makes the *next* recreate
    # painful; it breaks nothing today. Refusing to boot over it would turn a
    # latent problem into an outage, so a failure here is logged and the app
    # starts anyway.
    subprocess.run([python, 'manage.py', 'ensure_ownership'], check=False)

    port = os.environ.get('DATABRICKS_APP_PORT', '8000')
    os.execv(
        python,
        [
            python, '-m', 'gunicorn', 'config.wsgi:application',
            '--bind', f'0.0.0.0:{port}',
            # The rebuild endpoint runs the full pipeline in-request.
            '--timeout', '600',
            '--access-logfile', '-',
        ],
    )


if __name__ == '__main__':
    main()
