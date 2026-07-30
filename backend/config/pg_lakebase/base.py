"""
Postgres backend for Databricks Lakebase: identical to Django's postgresql
backend except that a missing/empty password is filled with a freshly minted
OAuth token at connection time (see credentials.py). With PGPASSWORD set
(local runs of config.settings.databricks) it behaves exactly like the stock
backend - the token path never fires.
"""

from django.db.backends.postgresql import base


class DatabaseWrapper(base.DatabaseWrapper):
    def get_connection_params(self):
        params = super().get_connection_params()
        # Stock backend omits the key entirely when PASSWORD is ''.
        if not params.get('password'):
            from .credentials import lakebase_token

            params['password'] = lakebase_token()
        return params
