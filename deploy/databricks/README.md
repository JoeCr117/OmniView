# deploy/databricks/

## Purpose
The Databricks App deployment: its runtime spec, the resource bindings created at
provisioning, the manifest recording every workspace resource this deployment
owns, and the two scripts that build and tear it down.

## Role in OmniView
This is how OmniView reaches production. `build_app.py` assembles a source bundle
at `dist/databricks_app/`; that bundle is uploaded to the workspace and deployed
as a Databricks App, which runs `databricks_start.py` under gunicorn against a
Lakebase Postgres database. `databricks_manifest.json` is the source of truth for
teardown — `tear_down.py` deletes exactly what it lists and nothing else.

**Two files here are git-ignored deployment state, not source**: `app.yaml` and
`databricks_manifest.json`. They name a live Postgres endpoint, a service
principal and the admin allow-list, and they change on every rebuild. Each has a
tracked `*.example.*` template beside it; `build_app.py`, `tear_down.py` and
`provision_db.py` all fail with a pointer to the template when the real file is
absent. See docs/DEPLOYMENT.md → "The manifest is deployment state, not source".

## Contents
| Item | What it does |
|------|--------------|
| `app.yaml` | **Git-ignored.** Runtime spec the Apps platform reads: start command + env (`OMNIVIEW_*`, `ENDPOINT_NAME`, warehouse id, admin emails). Copied to the **bundle root**. |
| `app.example.yaml` | Tracked template for the above — copy it to `app.yaml` and fill in the placeholders. |
| `databricks_start.py` | The entry point. Ensures schemas, migrates, then execs gunicorn. Copied to the **bundle root**. |
| `app_create.json` | Full app spec (Lakebase branch/db + secret-scope resources) for `apps create`. |
| `app_update.json` | Update spec (`user_api_scopes`) — **must send the full spec**, or the PATCH deletes resources. |
| `databricks_manifest.json` | **Git-ignored.** Every created resource for *this* deployment: workspace host, app URL, Lakebase endpoint, service principal, plus the per-rebuild log. |
| `databricks_manifest.example.json` | Tracked template for the above. |
| `provision_db.py` | Grants the app SP `omniview_owner` + database privileges after every `apps create`. `--verify` is a read-only ownership tripwire. |
| `build_app.py` | Builds the frontend, collects static files, assembles `dist/databricks_app/`. Self-checking (see below). |
| `tear_down.py` | Deletes the manifest's resources. Dry-run by default; `--yes` to execute. Aborts rather than guessing (see below). |

## Built-in safety checks

Both scripts guard the failure modes that would otherwise be **silent**:

`build_app.py`
- **Stale `IGNORES` key** — the dict is keyed by `COPIES` source strings, and a
  mismatch would fall back to the default ignore set and ship test code. Checked
  before the build starts.
- **Leaked test code** — after copying, the bundle is scanned for `tests`,
  `conftest.py` and `.e2e` under `backend/`. Any hit fails the build.
- **Bundle-root specs** — verifies `app.yaml` and `databricks_start.py` actually
  landed at the bundle root.
- **`requirements.txt`** — its presence would force pip mode (Python 3.11).

`tear_down.py`
- **Preflight auth check** — an expired token aborts up front.
- **Probe failures are not "absent"** — only an error matching `NOT_FOUND_MARKERS`
  counts as a deleted resource. Anything else (auth, network, permissions) raises
  `TeardownError` and exits non-zero. This matters because the naive version
  treated *any* failed probe as "already gone", so an expired token made a
  four-resource workspace look fully torn down and exited 0 — reporting success
  having never contacted the workspace.
- **All-SKIP warning** — a run where every resource probes absent prints a note,
  since that is also what a misconfigured profile looks like.

## Conventions & gotchas
- **`app.yaml` and `databricks_start.py` flatten to the bundle root.** They live
  in this directory in the repo, but `build_app.py` copies both to the top of
  `dist/databricks_app/`. That is why `app.yaml`'s
  `command: ["python", "databricks_start.py"]` has no directory prefix, and why
  `databricks_start.py` resolves `./backend` relative to itself — that adjacency
  exists only in the built bundle, never in the repo. Do not "fix" either path.
- **Upload with `workspace import-dir --overwrite`, not `databricks sync`.** Sync
  honors `.gitignore`, `dist/` is gitignored, so sync silently uploads nothing and
  the deploy then fails with "no files found".
- **`apps update` PATCH replaces the entire spec.** Sending only scopes once
  deleted the Lakebase + secret bindings and crashed the app. Always send
  resources from `app_create.json` *plus* scopes from `app_update.json`.
- **No `requirements.txt` may reach the bundle** — its presence forces pip mode,
  pinned to Python 3.11, which is too old for Django 6. `build_app.py` hard-fails
  if it finds one.
- **Never run the pipeline or dbt against Lakebase with personal credentials.**
  The in-app Rebuild button (service-principal identity) is the only supported
  cloud rebuild path; anything else creates objects owned by the wrong role.
- `build_app.py`'s `IGNORES` dict is keyed by the `COPIES` source strings. A
  mismatch falls back to the default ignore set and ships `tests/` to production
  **silently** — verify `dist/databricks_app/backend/` has no `tests/` after any
  change here.

## See also
- [deploy/](../README.md) · [Repo root](../../README.md) · [docker/](../../docker/README.md) (the local environment, not this)
- `docs/DEPLOYMENT.md` — "Databricks Apps + Lakebase" and "Two ways to brick the deployed app".
