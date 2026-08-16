"""
OAuth database credentials for Databricks Lakebase.

On Databricks Apps the attached Lakebase resource injects PGHOST/PGUSER/...
but no PGPASSWORD - the password is a short-lived OAuth token minted through
the workspace API (WorkspaceClient() self-configures from the app's
DATABRICKS_* env vars). Tokens expire after 1h but Postgres enforces expiry
only at login, so already-open connections keep working; the cache below just
keeps new logins (Django reconnects, pipeline subprocesses) from hitting the
API on every connection.
"""

import os
import threading
import time

# Tokens live 1h; refresh with margin so a token is never handed out close
# to its expiry (a pipeline run must be able to log in with it a bit later).
_CACHE_TTL_SECONDS = 40 * 60

_lock = threading.Lock()
_cached_token: str | None = None
_cached_at: float = 0.0


def lakebase_token() -> str:
    """A currently-valid OAuth token usable as the Postgres password."""
    global _cached_token, _cached_at
    with _lock:
        if _cached_token and time.monotonic() - _cached_at < _CACHE_TTL_SECONDS:
            return _cached_token

        from databricks.sdk import WorkspaceClient

        credential = WorkspaceClient().postgres.generate_database_credential(
            endpoint=os.environ['ENDPOINT_NAME']
        )
        if credential.token is None:
            # Raised here rather than returned: a None reaches psycopg as a
            # missing password and surfaces as an authentication failure that
            # names the database, not the credential mint that actually failed.
            raise RuntimeError(
                f'Lakebase returned no token for endpoint {os.environ["ENDPOINT_NAME"]!r}.'
            )
        _cached_token = credential.token
        _cached_at = time.monotonic()
        return _cached_token
