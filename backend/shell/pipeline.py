"""Running an OmniView app's ETL from the web process.

Pipelines live outside the web layer (pipelines/<app>/) and are invoked as a
subprocess rather than imported: they are long-running, they chdir into the dbt
project, and they must not share Django's DB connections. Any app with a
pipeline calls run_pipeline() with its module path; nothing here knows which
apps exist.

The rebuild drops and recreates the datavault-schema tables Django reads (dbt
table materializations DROP ... CASCADE). We mitigate by:
  - closing any open Django DB connections before shelling out
    (connections.close_all()), and setting CONN_MAX_AGE=0 on the datavault
    alias so no idle transaction can block dbt's drops;
  - serializing rebuilds behind an in-process lock, so concurrent POSTs can't
    race on the drop/recreate.
This does not solve cross-process concurrency (a pipeline run started from a
shell, or a second web worker), but that was already true.
"""

import logging
import os
import subprocess
import sys
import threading

from django.db import connections

logger = logging.getLogger('omniview.pipeline')

_rebuild_lock = threading.Lock()


def _pipeline_env() -> dict:
    """Env for the pipeline subprocess.

    On Databricks there is no PGPASSWORD - mint a Lakebase OAuth token so
    pandas/dbt in the subprocess just see a normal password (they know nothing
    about Databricks).
    """
    env = os.environ.copy()
    # pydbt shells out to `dbt` by name; guarantee the venv's bin/Scripts dir
    # (where dbt lives, next to this interpreter) is on the subprocess PATH.
    # Databricks Apps launches the venv python by path without ever putting it
    # on PATH, so `dbt` exits 127 there without this.
    venv_bin = os.path.dirname(os.path.abspath(sys.executable))
    env['PATH'] = venv_bin + os.pathsep + env.get('PATH', '')
    if not env.get('PGPASSWORD') and env.get('ENDPOINT_NAME'):
        from config.pg_lakebase.credentials import lakebase_token

        env['PGPASSWORD'] = lakebase_token()
    return env


def is_rebuild_running() -> bool:
    return _rebuild_lock.locked()


def run_pipeline(module: str, root) -> dict:
    """Run `python -m <module>` from `root`, serialized against other rebuilds.

    Returns {status: ok|failed|already_running, stdout, stderr, returncode}.
    `-m` (rather than a script path) is what puts `root` on sys.path, so the
    pipeline's `from pipelines...` imports resolve; `root` is therefore the repo
    root, not the pipeline's own directory.
    """
    if not _rebuild_lock.acquire(blocking=False):
        logger.warning('Pipeline rebuild requested while another is already running')
        return {'status': 'already_running', 'stdout': '', 'stderr': '', 'returncode': None}

    try:
        logger.info('Pipeline rebuild started (module=%s root=%s)', module, root)
        connections.close_all()
        # sys.executable (not `uv run`) so the same call works in every venv
        # this server runs under: local dev, the Docker image, and Databricks
        # Apps (which has uv-installed deps but no uv on PATH at runtime).
        result = subprocess.run(
            [sys.executable, '-m', module],
            cwd=str(root),
            capture_output=True,
            text=True,
            env=_pipeline_env(),
        )
        status = 'ok' if result.returncode == 0 else 'failed'
        log = logger.info if status == 'ok' else logger.error
        log('Pipeline rebuild finished: status=%s returncode=%s', status, result.returncode)
        return {
            'status': status,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode,
        }
    finally:
        _rebuild_lock.release()
