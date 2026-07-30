# backend/config/pg_lakebase/

## Purpose
A thin subclass of Django's PostgreSQL backend that supplies a **Lakebase OAuth
token as the database password** when none is set in the environment. On
Databricks there is no static `PGPASSWORD`; the token is minted per connection
and cached under a lock (~40 min; Lakebase enforces the 1h expiry at login only).

## Role in OmniView
`config.settings.databricks` points `ENGINE` here instead of the stock backend.
With `PGPASSWORD` set (local/Docker) it is byte-identical to the stock backend,
so nothing changes off Databricks. The same token helper is reused by
`shell/pipeline.py` to inject `PGPASSWORD` into the ETL subprocess.

## Contents
| Item | What it does |
|------|--------------|
| `base.py` | The `DatabaseWrapper` subclass; overrides `get_connection_params` to fill a missing password with a token. |
| `credentials.py` | `lakebase_token()` — mints + caches the credential via `WorkspaceClient().postgres.generate_database_credential`. |

## Conventions & gotchas
- The signature is pinned against the installed `databricks-sdk` version;
  bumping the SDK means re-checking it.
- Never run the pipeline against Lakebase with personal creds — dbt tables would
  end up owned by your role and the app's service principal couldn't drop them.

## See also
- [config/](../README.md) · [settings/](../settings/README.md) · [shell/pipeline.py](../../shell/README.md)
