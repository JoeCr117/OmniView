"""How the Admin Portal's Databricks failures become HTTP responses.

The jobs and costs endpoints talk to Databricks on behalf of the signed-in user,
which fails in two ways the frontend must tell apart: no workspace connection at
all (show a "not connected" card) versus connected but refused (the user hasn't
consented to the scope - show a consent hint). The `code` in the body is what
the UI branches on; the status alone is not enough.

Registered by config/api.py via the `errors` hook on this app's OmniViewApp
declaration, so the shell's API module doesn't have to import anything
Databricks-specific.
"""

from apps.admin_portal.databricks import DatabricksForbidden, DatabricksNotConnected


def register_errors(api) -> None:
    @api.exception_handler(DatabricksNotConnected)
    def _not_connected(request, exc):
        return api.create_response(
            request, {'detail': str(exc), 'code': 'not_connected'}, status=503
        )

    @api.exception_handler(DatabricksForbidden)
    def _forbidden(request, exc):
        return api.create_response(
            request, {'detail': str(exc), 'code': 'missing_scope'}, status=403
        )
