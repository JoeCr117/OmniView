# backend/shell/tests/

## Purpose
The shell's own test suite: the platform behaviours that aren't tied to any
dashboard app — auth endpoints, the pipeline runner, the registry, header
sign-in, DB routing, logging.

## Role in OmniView
These lock the guarantees the apps build on. `test_registry.py` fails if the
backend and frontend registries disagree on app ids; `test_pipeline.py` proves
the subprocess-runner logs and serializes correctly; `test_auth_api.py` covers
the `/session` boot and CSRF.

## Contents
| Item | What it does |
|------|--------------|
| `test_auth_api.py` | login/logout/csrf/me/config + `/session` (1-RTT boot, CSRF cookie). |
| `test_auth_signals.py` | Auth events log under `omniview.auth`. |
| `test_db_router.py` | Managed→default, unmanaged→datavault; migrations kept off datavault. |
| `test_e2e_bootstrap.py` | The `IS_E2E` guard + bootstrap steps. |
| `test_logs_api.py` | The frontend log sink. |
| `test_pipeline.py` | `run_pipeline` logging + contention + `-m` invocation. |
| `test_registry.py` | Backend/frontend registries agree on app ids. |
| `test_remote_auth.py` · `test_sso.py` | Databricks header sign-in + the SSO config flag. |

## Conventions & gotchas
- The subprocess in `test_pipeline.py` is monkeypatched — these tests never run a
  real rebuild.

## See also
- [shell/](../README.md) · [config/tests/](../../config/tests/README.md)
