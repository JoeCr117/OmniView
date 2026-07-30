"""
Databricks workspace client for the Admin Portal, following AppKit's
on-behalf-of-user convention (`.asUser(req)`): prefer the signed-in user's
forwarded access token (injected by the Apps proxy once user_api_scopes are
configured), so jobs/costs reflect exactly what the visiting admin can see.

Fallback chain:
1. x-forwarded-access-token header + DATABRICKS_HOST  -> OBO client (prod).
2. Zero-arg WorkspaceClient()                          -> env/profile auth
   (the app's service principal in prod before scopes land; a developer's
   DATABRICKS_CONFIG_PROFILE locally).
3. Neither configurable                                -> DatabricksNotConnected.

Error taxonomy (mapped to HTTP in config/api.py's exception handlers):
- DatabricksNotConnected -> 503 {"code": "not_connected"}
- DatabricksForbidden    -> 403 {"code": "missing_scope"}
"""

import os
from contextlib import contextmanager

OBO_HEADER = 'HTTP_X_FORWARDED_ACCESS_TOKEN'


class DatabricksNotConnected(Exception):
    pass


class DatabricksForbidden(Exception):
    pass


def obo_client(request):
    from databricks.sdk import WorkspaceClient

    token = request.META.get(OBO_HEADER)
    host = os.environ.get('DATABRICKS_HOST')
    if token and host:
        return WorkspaceClient(host=host, token=token, auth_type='pat')
    return fallback_client()


def fallback_client():
    """App-identity (or local env/profile) client - the non-OBO path. Used
    directly when a forwarded user token exists but lacks a scope this
    workspace can't grant (the jobs scope on Free Edition)."""
    from databricks.sdk import WorkspaceClient

    try:
        return WorkspaceClient()
    except Exception as exc:
        raise DatabricksNotConnected(
            'Databricks is not connected: no forwarded user token and no '
            'workspace credentials in the environment.'
        ) from exc


@contextmanager
def translate_errors():
    """Map SDK failures onto the portal's error taxonomy."""
    from databricks.sdk import errors

    try:
        yield
    except errors.PermissionDenied as exc:
        raise DatabricksForbidden(
            'Databricks denied the request - the app may be missing the '
            'required user authorization scope, or your consent is pending. '
            f'({exc})'
        ) from exc
    except (errors.DatabricksError, OSError) as exc:
        raise DatabricksNotConnected(f'Databricks request failed: {exc}') from exc
