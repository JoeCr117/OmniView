# backend/shell/

## Purpose
OmniView *itself* — everything true of every app, with no knowledge of any
specific app: the app registry, the `OmniViewApp` declaration shape, the auth
classes, session/log endpoints, Databricks header sign-in, and the generic
pipeline runner. (Formerly `core/`.)

## Role in OmniView
The registry (`registry.py`) is the single list of apps; each app declares
itself via its own `omniview_app.py` (shape: `appspec.py`). That one declaration
drives `INSTALLED_APPS`, the `/api/<id>/` mount + auth, datavault routing, the
grantable-app list, and legacy redirects. The shell never names an app; an app
never edits the shell.

## Contents
| Item | What it does |
|------|--------------|
| `registry.py` | `OMNIVIEW_APPS` — the one list, plus the derived `DATAVAULT_APPS` / `GRANTABLE_APP_IDS` / `LEGACY_REDIRECTS`. |
| `appspec.py` | The `OmniViewApp` dataclass an app fills in. |
| `security.py` | `SessionAuthWhenRequired` / `AdminAuth` / `AppAccessAuth` (deny-by-default). |
| `auth_api.py` | `/api/auth` — login/logout/csrf/me/config **and `/session`** (the 1-RTT boot). |
| `logs_api.py` | `/api/logs/frontend` — the browser log sink. |
| `remote_auth.py` | Databricks identity-header sign-in (wired only under `databricks` settings). |
| `pipeline.py` | `run_pipeline(module, root)` + `is_rebuild_running()` — generic, app-agnostic. |
| `signals.py` | Logs auth events (login/logout/failure) under `omniview.auth`. |
| `management/` | `ensure_schemas`, `e2e_bootstrap`. |
| `tests/` | The shell's own test suite. |

## Conventions & gotchas
- `pipeline.py` runs the ETL as a subprocess via `python -m`, serialized behind
  an in-process lock; it closes Django connections first so dbt can drop tables.
- Renaming this package is safe (no migrations) — but do **not** rename app labels.

## See also
- [backend/](../README.md) · [apps/](../apps/README.md) · [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
- [management/commands/](management/commands/README.md) · [tests/](tests/README.md)
