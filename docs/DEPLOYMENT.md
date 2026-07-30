# Deployment & Testing Guide

This covers running OmniView's Next.js/Django layer (see `CLAUDE.md` for
architecture) locally for development, in Docker as a single container, and how
to verify each feature area works after a change.

## Prerequisites

- **uv** (Python package/venv manager, Python >= 3.13) - for the pipeline and backend.
- **Node.js** (matching `frontend/package.json`'s Next 16 requirements) - for the frontend.
- **Docker Desktop** - for the local dev/test environment (its Postgres server is a
  prerequisite for nearly everything below). On Windows this needs virtualization
  enabled in BIOS; `docker info` should succeed with no daemon-connection error before
  you try building. Full guide: [docker/README.md](../docker/README.md).
- **Postgres** - the compose `db` service
  (`docker compose -f docker/docker-compose.yml up -d db`); every path below (dev
  servers, pipeline, dbt, E2E) talks to it via the libpq `PG*` env vars, which all
  default to the compose service (`omniview`/`omniview-dev`@`127.0.0.1:5432`).
  See [docker/README.md](../docker/README.md).

## Running the data pipeline directly (no web layer)

```
uv run python -m pipelines.expense_tracker.main
```

Reads the source data (RawFile/BudgetMapDocument rows in the `omniview` schema),
restages `stg_*` into the `datavault` schema, and runs dbt end-to-end. First-time
setup: load the source rows once with
`cd backend && uv run python manage.py migrate && uv run python manage.py import_banks_dir ..\Data\Banks`.

## Local development (no Docker)

Two processes, run in separate terminals:

**Backend** (Django + Ninja API, port 8000):
```
cd backend
uv run python manage.py runserver 8000
```
Uses `config.settings.local` by default (connects to the compose Postgres via the
`PG*` env-var defaults - run `docker compose -f docker/docker-compose.yml up -d db`
first, nothing else needed).

**Frontend** (Next.js dev server, port 3000):
```
cd frontend
npm run dev
```
CORS (`django-cors-headers`) is already configured in `backend/config/settings/local.py`
to allow `http://localhost:3000` to call the port-8000 API. Open
`http://localhost:3000` in a browser.

The dev frontend finds the API via `frontend/.env.development.local` (gitignored -
recreate it if missing), which must point at the backend's port:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Authentication (OmniView, M5+)

Django's own tables (users, sessions, admin) live in the **`omniview` schema**
of the deployment's Postgres database — separate from the `datavault` schema
because the pipeline drops and rebuilds datavault's tables, and logins must
survive rebuilds (`backend/config/db_router.py` keeps migrations and managed
models off the `datavault` alias). Create/refresh the tables with:

```
cd backend
uv run python manage.py migrate
```

**Create the first user** (interactive):
```
uv run python manage.py createsuperuser
```
or non-interactive (this is what the Docker entrypoint runs on first boot when
the `DJANGO_SUPERUSER_*` env vars are set):
```
DJANGO_SUPERUSER_USERNAME=... DJANGO_SUPERUSER_EMAIL=... DJANGO_SUPERUSER_PASSWORD=... \
  uv run python manage.py createsuperuser --noinput
```

**Environment flags** (all optional in dev):
- `OMNIVIEW_AUTH_REQUIRED` — enforcement is **on by default** (since M6): the
  API requires a session (+ CSRF on writes), `/api/docs` and HTML pages
  redirect to `/login`. Set `OMNIVIEW_AUTH_REQUIRED=0` as the escape hatch to
  run open. Static assets (`_next/*`, files with extensions) are always
  served — the API is the security boundary.
- `SECRET_KEY` — set explicitly in any real deployment (dev falls back to an
  insecure default).
- `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID` /
  `AZURE_AUTO_LOGIN=1` — Entra ID SSO, see below.

### Azure Entra ID SSO (M7+)

Sign-in with Microsoft is handled by django-allauth's server-side redirect
flow and is configured **entirely from environment variables** — no
SocialApp rows in the database:

- `AZURE_CLIENT_ID` — the Entra app registration's Application (client) ID.
  Setting this is what enables SSO: the login page shows (and, with
  auto-login, triggers) the Microsoft button only when
  `GET /api/auth/config` reports `azure_enabled: true`.
- `AZURE_CLIENT_SECRET` — a client secret from the app registration.
- `AZURE_TENANT_ID` — your Directory (tenant) ID; defaults to `common`
  (any Microsoft account) when unset.
- `AZURE_AUTO_LOGIN=1` — the login page immediately bounces anonymous
  visitors into the Microsoft flow. Loop protections: `/login?auto=0`
  keeps the password form usable, and signing out sets a sessionStorage
  flag so you land back on `/login` without being signed straight back in
  (a deliberate click on the Microsoft button re-arms auto-login).

In the Entra app registration, add a **Web** redirect URI of
`http://localhost:8000/accounts/microsoft/login/callback/` (and the same
path on any other host/port you serve from). A first Microsoft sign-in
whose email matches an existing local account signs into and permanently
connects to that account (`SOCIALACCOUNT_EMAIL_AUTHENTICATION` +
`_AUTO_CONNECT`, safe because the tenant is your own); an unknown email
auto-creates a user.

Session endpoints: `GET /api/auth/csrf` (sets the csrftoken cookie),
`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`,
`GET /api/auth/config`. Login/logout require the `X-CSRFToken` header matching
the csrftoken cookie, and **login rotates the CSRF token** — re-fetch
`/api/auth/csrf` afterwards. `/admin/` works against the omniview schema for
user management.

## Logging (M8+)

Everything goes to stdout (picked up by the dev console and `docker logs`);
set `LOG_DIR` to also write a rotating `omniview.log` there. `LOG_LEVEL`
(DEBUG/INFO/WARNING/ERROR, default INFO) tunes verbosity.

Log line format: `<time> <LEVEL> [<logger>] [<request-id>] <message>`.
Every request gets one INFO line under `omniview.request` (method, path,
status, user, duration) and an `X-Request-ID` response header (a supplied
inbound `X-Request-ID` header is honored, e.g. from a reverse proxy) — the
same ID is stamped on every log line emitted while handling that request.
Auth events (`omniview.auth`: login/logout INFO, failed logins WARNING) come
from Django's auth signals, so password, SSO, and /admin/ logins all produce
them. Pipeline rebuilds log start/finish/returncode under
`omniview.pipeline`.

Browser-side errors are captured too: React error boundaries and window
`error`/`unhandledrejection` listeners POST to `/api/logs/frontend`
(session-gated when auth is on) and land under `omniview.frontend`.
`NEXT_PUBLIC_LOG_LEVEL` (build-time) tunes the frontend's own console
verbosity (default: debug in dev, warn in prod builds).

## Local environment (Docker)

The local dev/test environment — the Postgres server every host-side workflow
connects to, plus an optional full-stack run of the app on
`http://127.0.0.1:8010` — is provided by Docker and documented in full at
**[docker/README.md](../docker/README.md)**, including a from-zero explanation for
anyone new to Docker.

The two commands worth knowing here:

```powershell
docker compose -f docker/docker-compose.yml up -d db   # Postgres only (what most work needs)
docker compose -f docker/docker-compose.yml up -d      # full stack on 127.0.0.1:8010
```

Docker is **not** the production deployment — see "Databricks Apps + Lakebase"
below for that.

## Environment variable reference

Read by every tier (local, Docker, Databricks); all optional unless noted. Under
Docker, set them in `docker/.env`; on Databricks they come from
`deploy/databricks/app.yaml` and the Lakebase resource binding.

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | insecure dev value | **Set in any real deployment.** Django signing key (sessions, CSRF). |
| `DJANGO_SUPERUSER_USERNAME` / `_EMAIL` / `_PASSWORD` | unset | First-boot admin account; ignored once the user exists. |
| `OMNIVIEW_AUTH_REQUIRED` | `1` (on) | `0` runs the app open (no login) - escape hatch only. |
| `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID` | unset / unset / `common` | Entra ID SSO (see "Azure Entra ID SSO" above). Setting the client ID enables the Microsoft button. |
| `AZURE_AUTO_LOGIN` | `0` | `1` bounces anonymous visitors straight into the Microsoft flow. |
| `LOG_LEVEL` | `INFO` | Backend log verbosity (DEBUG/INFO/WARNING/ERROR). |
| `LOG_DIR` | unset | Also write a rotating `omniview.log` under this path. |
| `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` / `PGSSLMODE` | compose defaults | libpq-standard connection settings; compose sets `PGHOST=db`, everything else defaults to the dev values. |

Docker logs/shell/stop commands, and the rest of the local workflow, are in
[docker/README.md](../docker/README.md) ("Command cookbook").

## Databricks Apps + Lakebase (cloud deployment)

The same code deploys to Databricks Apps (Free Edition) with Lakebase
(managed Postgres) as the database. Everything that exists in the workspace
is listed in **`deploy/databricks/databricks_manifest.json`** — the app URL, service
principal, Lakebase endpoint, and the exact resource list that
`deploy/databricks/tear_down.py` deletes. That file is **git-ignored** (it names a
live endpoint and service principal); `databricks_manifest.example.json` is the
tracked template — see "The manifest is deployment state, not source" below.

**How it fits together**: the app runs `databricks_start.py` (ensure schemas
→ migrate → gunicorn on `$DATABRICKS_APP_PORT`) under
`config.settings.databricks`. The attached Lakebase resource injects `PG*`
env vars (no password — `config/pg_lakebase` mints OAuth tokens against
`ENDPOINT_NAME` from `app.yaml`). Sign-in is Databricks' own OAuth door;
the app trusts `X-Forwarded-Email` and auto-creates users.

**Free Edition gotchas**:
- Apps **auto-stop 24h after the last start/deploy**. Restart with
  `databricks apps start omniview --profile DatabricksFree` (or the
  workspace UI → Compute → Apps).
- Lakebase scales to zero — first query after idle takes a few seconds.
- uv mode requires `pyproject.toml` + `uv.lock` and **no requirements.txt
  anywhere in the bundle** (pip mode is pinned to Python 3.11). Keep
  `requires-python` capped `<3.14` — the platform takes the newest allowed
  interpreter and 3.14 forces a pydantic-core source build that fails.

**Each deploy** (after code changes):
```powershell
uv run python deploy/databricks/build_app.py            # next build + collectstatic + assemble dist/databricks_app
databricks workspace import-dir dist/databricks_app "/Workspace/Users/<your-workspace-user>/omniview-app" --overwrite --profile DatabricksFree
databricks apps deploy omniview --source-code-path "/Workspace/Users/<your-workspace-user>/omniview-app" --profile DatabricksFree
```
(`workspace import-dir`, not `databricks sync` — sync honors .gitignore and
`dist/` is ignored, so sync uploads nothing.)

**One-time provisioning** (already done; re-runnable if torn down):
1. `databricks postgres create-project omniview` (creates branch
   `production`, endpoint `primary`, database `databricks_postgres`, PG 17).
2. `databricks secrets create-scope omniview` + put secret `secret-key`
   (random Django SECRET_KEY).
3. `databricks apps create --json @deploy/databricks/app_create.json` — attaches the
   Lakebase branch/database (CAN_CONNECT_AND_CREATE) and the secret scope.
4. Grant the app's service principal CAN_READ on the workspace source folder
   (`databricks workspace update-permissions directories <folder-object-id>`),
   or deploy fails with "no files found".
5. Deploy (above), then one-time data load from this machine:
   ```bash
   export PGPASSWORD=$(databricks postgres generate-database-credential projects/omniview/branches/production/endpoints/primary --profile DatabricksFree -o json | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
   PGHOST=<lakebase_host from manifest> PGDATABASE=databricks_postgres PGUSER=<your workspace email> PGSSLMODE=require \
     uv run python backend/manage.py import_banks_dir Data/Banks
   ```
6. Open the app URL in a browser, sign in, and click **Rebuild** (Budget
   page) to build the warehouse.

> **Ownership rule**: never run the pipeline against Lakebase with *your* PG
> credentials — dbt tables would then be owned by your role and the app's
> in-app Rebuild (running as the app's service principal) could no longer
> drop/recreate them. The Rebuild button is the only supported way to build
> datavault in the cloud. (Loading *source rows* with your credentials is
> fine — those tables are owned by the app, you only insert.)

**Logs**: `databricks apps logs omniview --tail-lines 100 --profile DatabricksFree`.

### Two ways to brick the deployed app (both hit once — read before touching the app spec)

**1. `apps update` replaces the whole app spec.** The PATCH behind both
`databricks apps update` and the SDK's `w.apps.update()` is a *full
replacement*, not a merge. Sending only `{"user_api_scopes": [...]}` **deletes
the app's `resources`** — the Lakebase and secret-scope bindings vanish, the
`PG*` env vars stop being injected, and the app crashes on boot with
`connection refused 127.0.0.1:5432`. Always send the complete spec:

```python
from databricks.sdk import WorkspaceClient
from databricks.sdk.service.apps import App, AppResource

w = WorkspaceClient(profile='DatabricksFree')
w.apps.update('omniview', App(
    name='omniview',
    resources=[AppResource.from_dict(r) for r in resources],  # deploy/databricks/app_create.json
    user_api_scopes=['sql'],                                   # deploy/databricks/app_update.json
))
```

**2. Re-attaching the Lakebase resource reassigns schema ownership.** When the
postgres resource is (re)bound, the platform rebuilds the app's service-principal
role — `REASSIGN OWNED` moves every object it owned to the *project owner* (your
workspace user) and the new SP role comes back with only Connect+CreateDB. The SP
then has **zero privileges on the `omniview`/`datavault` schemas**, and startup
dies in `migrate` with `permission denied for schema public` (it falls through to
`public` because it can't use its own schema).

You cannot simply hand the schemas back to the SP: `ALTER SCHEMA ... OWNER TO
"<sp>"` requires you to be a *member* of the SP role, and on PG16 nobody holds
ADMIN on the platform-created role. The fix is a **shared owner role**.

**This is now automated — never run the SQL by hand.** After every `apps create`
(and safe to re-run any time), run:

```powershell
uv run python deploy/databricks/provision_db.py            # provision + verify
uv run python deploy/databricks/provision_db.py --verify   # read-only ownership tripwire
```

It mints a Lakebase token as the workspace user (via the SDK, the same mechanism
`backend/config/pg_lakebase/` uses for the app) and idempotently applies exactly
the grants below, reading the app SP live and the Lakebase coordinates from
`databricks_manifest.json`. It works from any state (undelete, fresh create,
re-run). The `build-omniview` skill calls it at Step 3 (and Step 7 for `--verify`).

The grants it applies, for reference:

```sql
CREATE ROLE "omniview_owner" NOLOGIN;                -- you have CREATEROLE
GRANT "omniview_owner" TO "<your-email>"  WITH SET TRUE, INHERIT TRUE;  -- + ADMIN (auto)
GRANT "omniview_owner" TO "<app-sp-client-id>" WITH SET TRUE, INHERIT TRUE;
GRANT CREATE, CONNECT ON DATABASE "databricks_postgres" TO "omniview_owner";
ALTER SCHEMA "omniview" OWNER TO "omniview_owner";   -- + every table/view/sequence
ALTER SCHEMA "datavault" OWNER TO "omniview_owner";  -- (identity sequences follow their table)
```

Both identities inherit the role, so both pass ownership checks: Django can
`migrate`, dbt can drop/recreate `datavault`, and you can still administer the
schemas by hand. It also survives a *future* SP-role rebuild, since the objects
are no longer SP-owned. If you ever see `permission denied for schema public` in
the app logs, this is what regressed — re-run `provision_db.py`.

> The script applies the role + membership + database grants and (best-effort) the
> `ALTER SCHEMA ... OWNER` for schemas that already exist. On a brand-new database
> the schemas do not exist at provision time (the app creates them on first start);
> `manage.py ensure_ownership` then reassigns their *objects* as the SP. Repeated
> post-purge fresh creates are the one case where schema-*namespace* ownership can
> still drift — the undelete path (normal within 7 days) preserves it.

**3. Object ownership is not schema ownership** (hit 2026-07-20). The grants
above fix the schemas and the `omniview` tables — but `datavault`'s contents are
recreated by dbt on every rebuild, and Postgres assigns each new relation to
**its creator**, i.e. the app's service principal of the day. After two app
recreates, `datavault` held relations owned by a service principal that no longer
existed, and the current SP could neither `SELECT` nor `DROP` them: being fellow
members of `omniview_owner` does not grant access to another member's objects.
Symptom is `permission denied for table gold_Golden1_DailyMetrics` on a page load,
and a Rebuild that fails partway with `returncode=1`.

This is now prevented in the dbt project: an `on-run-end` hook
(`macros/ensure_schema_ownership.sql`) reassigns every relation in the target
schema to `omniview_owner` at the end of each run, while the creating role is
still alive and still owns what it made. It no-ops locally.

**…and the same is true of `omniview`** (hit 2026-07-21). The hook above covers
only dbt's schema. `manage.py migrate` creates *its* new tables owned by the app
SP too — which went unnoticed for as long as no migration added a table. Adding
Omni-ERD's `ErdLayout` was the first one since, and it landed owned by the SP
while its 18 neighbours were `omniview_owner`.

The counterpart is `manage.py ensure_ownership`, called right after `migrate` by
both `deploy/databricks/databricks_start.py` and `docker/entrypoint.sh`. Same
argument, same timing: the app owns what it just created *and* belongs to
`omniview_owner`, so it is the only identity that may reassign, and only right
then. It no-ops where the shared role is absent.

Both are deliberately **non-fatal** (`check=False` / `|| true`). Drift makes the
*next* app recreate painful but breaks nothing today, so refusing to boot over it
would convert a latent problem into an outage.

Tripwire for either schema — anything other than `omniview_owner` is a finding:

```sql
SELECT n.nspname, pg_get_userbyid(c.relowner) AS owner, count(*)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('omniview','datavault') AND c.relkind IN ('r','p','v','m')
GROUP BY 1, 2 ORDER BY 1, 2;
```

If you find stranded relations from *before* that hook existed, they cannot be
repaired in place — `REASSIGN OWNED` and `ALTER ... OWNER TO` both need
membership in the dead owning role, which nobody has. Discard the schema instead
(`datavault` is fully derived from the `omniview` source rows):

```sql
DROP SCHEMA datavault CASCADE;
CREATE SCHEMA datavault AUTHORIZATION omniview_owner;
```

then Rebuild. This works because schema ownership is checked independently of the
ownership of the objects inside it.

### Teardown is a soft delete, and the slug stays reserved for 7 days

Verified 2026-07-19, and it has shaped every rebuild since. `databricks postgres
delete-project` **soft**-deletes:

- `get-project` still answers, now reporting `delete_time` and `purge_time`
  (purge = delete + 7 days).
- The project disappears from `list-projects`.
- **The slug stays reserved until purge.** `create-project omniview` fails with
  *"project slug already exists"*, so you **cannot** rebuild under the same name
  inside that window.

Recovery is `databricks postgres undelete-project projects/omniview`, which
restores the project, its uid, the endpoint host and **all data** intact.

The practical consequence: a full teardown + rebuild that keeps the `omniview`
slug is only possible *after* the 7-day purge. Before then, undelete is the only
route back — which is what every rebuild in this project's history has actually
done. Two things follow from that:

- Because undelete preserves the data **and** `omniview_owner`'s ownership of it,
  `datavault` does not need rebuilding after a recreate. Verify rather than
  assume, with the tripwire query above.
- Each `apps create` mints a **new** service principal, so the previous one
  becomes stale. Stale SPs own nothing (that is what the self-healing above is
  for) and are destroyed with the project, so they need no cleanup — but the app
  SP must be re-granted `omniview_owner` on every recreate, which is exactly what
  `provision_db.py` does.

### The manifest is deployment state, not source

`deploy/databricks/databricks_manifest.json` is **git-ignored**. It records one
specific deployment — workspace host, live Lakebase endpoint hostname, app URL,
service-principal client id — none of which belong in a public repository, and
all of which change on rebuild. `tear_down.py` and `provision_db.py` both read
it and both fail with a pointed message when it is absent.

To set up a fresh clone, copy the tracked template and fill it in:

```powershell
cp deploy/databricks/databricks_manifest.example.json deploy/databricks/databricks_manifest.json
```

or let the `generate-artifact-manifest` skill write it after a deploy. Keep
deployment-specific facts (and the per-rebuild log) in that ignored file;
anything durable and non-specific belongs in this document instead.

### Admin Portal (access control + monitoring)

The **Admin Portal** app (staff-only) manages per-user app access and shows
Databricks monitoring dashboards. Key facts:

- **Access is deny-by-default**: a new user who signs in sees an empty
  launcher until an admin grants them apps (Admin Portal → Users & Access).
  Admins bypass grants and are the only ones who can open the portal.
- **Admin bootstrap**: emails in the `OMNIVIEW_ADMIN_EMAILS` env (app.yaml /
  compose .env) are promoted to staff on Databricks sign-in. A user with an
  *existing* session isn't re-promoted until their next sign-in — promote via
  the portal (another admin) or flip `is_staff` in the DB for the first admin.
- **User authorization (OBO)**: the app has `user_api_scopes: ["sql"]`
  (applied via `deploy/databricks/app_update.json`; each user sees a one-time consent
  prompt). Costs queries run on-behalf-of the signed-in admin against
  `system.billing` through the warehouse in `OMNIVIEW_SQL_WAREHOUSE_ID`.
  **Jobs**: this workspace's validator currently rejects every jobs scope
  spelling, so the Jobs tab automatically falls back to the app's own
  identity (empty lists unless the SP is granted job permissions); it
  self-heals if a jobs scope becomes grantable — add it to
  deploy/databricks/app_update.json and re-apply.
- Monitoring endpoints degrade cleanly: 503 `not_connected` (no credentials /
  no warehouse id) and 403 `missing_scope` (denied) render as distinct cards.

**Teardown** (removes exactly the manifest's resources, nothing else):
```powershell
uv run python deploy/databricks/tear_down.py        # dry run - prints the plan
uv run python deploy/databricks/tear_down.py --yes  # deletes app, source folder, secret scope, Lakebase project
```
The Lakebase project step destroys all cloud data (auth, uploaded CSVs,
budget map, warehouse); `Data/Banks` locally remains the re-import source.

## End-to-end tests (M9+)

```
cd frontend
npm run e2e
```

Prerequisite: the compose Postgres server must be up
(`docker compose -f docker/docker-compose.yml up -d db` - the bootstrap fails with
that hint otherwise).

Builds the static export, then Playwright starts its own Django server on
**port 8100** (8000 belongs to the production container) against a dedicated
**`omniview_e2e` database** — dropped, recreated, migrated, seeded with
fixture gold tables and fixture bank source rows, plus an
`e2e`/`e2e-password!` login, all by `manage.py e2e_bootstrap` under
`config.settings.e2e`. The real `omniview` database and the production
`Data/` tree are never read or written; the settings module also forces auth
ON with Azure off.

Specs live in `frontend/e2e/` and cover the login flow (bad + good
credentials), launcher → Check Book rendering seeded rows, the dark-mode
toggle persisting across reload, the sidebar sheet, legacy-URL 301s, and
viewport fullscreen. `npx playwright test` alone reuses an existing
`frontend/out` build; the server is bootstrapped fresh either way
(`reuseExistingServer` is off on purpose — whatever else is on 8100 isn't
the scratch environment).

## Testing / verifying each feature area

Automated suites first: `uv run pytest` (backend), `cd frontend && npm run test`
(Vitest), and `npm run e2e` (Playwright, see above). Then verify by exercising
the real app (backend endpoints + frontend pages) end to end - work through
whichever of these areas are affected:

### 1. API docs (Swagger)
```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/docs
```
Should be `200` - Django Ninja auto-serves this, no extra code needed. Also useful
for manually poking at any endpoint from a browser.

### 2. Read-only dashboards
Load each page and confirm data renders (not just "Loading..." or an error banner):
- `/check-book` - Tabulator table, per-day EOD balances/transactions with year/month slicers.
- `/daily-trends` - line chart + Tabulator table (local pagination).
- `/uncategorized` - Tabulator table, server-side pagination (Previous/Next).

Equivalent API-level check if you don't have a browser handy:
```
curl -s "http://localhost:8000/api/dailymetrics?limit=5"
curl -s "http://localhost:8000/api/transactions/uncategorized?limit=5"
curl -s "http://localhost:8000/api/transactions/budget-analysis"
```
All should return `{"items": [...], "count": N}` (dailymetrics/uncategorized are
paginated) or a plain array (budget-analysis is not paginated - small, fixed set).

### 3. Budget Map (CRUD)
This is the one page with real write endpoints - edit a budget, save, and rebuild:
1. Load `/budget-map`. Expand a category in the Tabulator tree table and edit a
   Budget cell.
2. Click **Save** - should show a confirmation message, not an error.
3. Click **Rebuild Data** - runs the full pipeline in-process; watch the
   stdout/stderr panel for `run_all executed in ...s` with no traceback.
4. Confirm the new value reached the database:
   ```
   curl -s http://localhost:8000/api/budgets/map
   ```

API-level equivalent of the whole loop (useful for scripting/CI-style checks):
```bash
curl -s "http://localhost:8000/api/budgets/yaml?bank=Golden1" > /tmp/budgetmap.json
# edit /tmp/budgetmap.json, then:
curl -s -X PUT "http://localhost:8000/api/budgets/yaml?bank=Golden1" \
  -H "Content-Type: application/json" --data-binary @/tmp/budgetmap.json
curl -s -X POST http://localhost:8000/api/budgets/rebuild
```

### 4. Raw CSVs (view + upload)
1. Load `/raw-csvs`. Click through the account subtabs (CreditCard, FreeChecking,
   MoneyMarket, Savings) - each should load a read-only Tabulator table of that
   account's CSV.
2. Click **Upload CSV for `<account>`**, pick a `.csv` file - it should appear in
   the file selector and load immediately after upload.
3. Uploading a duplicate filename should show an error (409), and a non-`.csv` file
   should be rejected (422).

API-level equivalent:
```bash
curl -s http://localhost:8000/api/rawdata/accounts
curl -s http://localhost:8000/api/rawdata/CreditCard/files
curl -s -F "file=@/path/to/statement.csv" http://localhost:8000/api/rawdata/CreditCard/upload
```
> **Windows curl gotcha**: this environment's curl (mingw32 build) silently fails
> on `-F "file=@path;filename=custom.csv"` (the `;filename=` override). Use the
> real file's basename with plain `-F "file=@path"` instead, or script the
> multipart request in Python if you need a different filename than what's on disk.

## Cleanup

Remove any leftover test data created while verifying uploads or budget edits so
the repo's sample data stays clean:
```bash
docker compose -f docker/docker-compose.yml down   # stop the local stack (keeps data)
# then check `git status` under Data/Banks/<Bank>/<Account>/ for any files you
# uploaded during manual testing, and remove them if they aren't meant to be kept
```
