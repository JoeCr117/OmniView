---
name: build-omniview
description: Deploy OmniView locally, to Databricks Apps + Lakebase, or both — then optionally run the test suites, clean up test artifacts, and regenerate the artifact manifest. Use when asked to deploy, build, stand up, rebuild, or redeploy the project.
---

# Build OmniView

Deploy the project and optionally verify it. Runs as a guided sequence with four
decision points; ask each one when you reach it, not all up front.

## Flow

1. **Ask the deployment target** — local only, cloud only, or both.
2. Deploy it.
3. **Ask whether to run tests.** If yes, run them and report results.
4. If tests ran, **ask whether to delete the test artifacts** they produced.
5. **Ask whether to invoke `generate-artifact-manifest`.** If yes, invoke it.
   If no, the skill is complete.

Never skip a question because the answer seems obvious, and never merge them
into one prompt — each depends on the outcome of the step before it.

---

## Local deployment

Prerequisites: Docker running, and PowerShell (compose from Git Bash mangles
Windows paths). Every compose command needs `-f docker/docker-compose.yml` —
the file is not at the repo root.

```powershell
uv sync                                                    # creates .venv
cd frontend; npm install; cd ..                            # creates node_modules
docker compose -f docker/docker-compose.yml up -d db       # Postgres only
cd backend
uv run python manage.py ensure_schemas                     # MUST precede migrate
uv run python manage.py migrate --noinput
uv run python manage.py import_banks_dir ..\Data\Banks     # upsert; safe to re-run
cd ..
uv run python -m pipelines.expense_tracker.main            # stage + dbt build
docker compose -f docker/docker-compose.yml up -d --build  # full stack on 8010
```

**Notes learned the hard way:**

- `ensure_schemas` must run **before** the first `migrate`. The default alias's
  `search_path` starts at `omniview`; without the schema, Django creates its
  tables in `public`.
- Run the pipeline from the **repo root** with `-m`. That is what puts the root
  on `sys.path` so `pipelines.*` resolves.
- **Port 8000 belongs to a different, older production container.** Verify on
  **8010**. Never bind or test against 8000.
- If `uv run <script>` or a `.venv\Scripts\*.exe` fails with *"Failed to
  canonicalize script path"*, the venv's launcher shims are stale — delete
  `.venv` and re-run `uv sync`. That rebuilds them correctly. (Workaround if you
  cannot: `.venv\Scripts\python.exe -m dbt.cli.main` / `-m pytest`.)

Verify: app logs show `Schemas ensured`, migrations applied, gunicorn listening;
`http://127.0.0.1:8010/login` returns 200.

## Cloud deployment (Databricks Apps + Lakebase)

Profile `DatabricksFree`. Resources are recorded in
`deploy/databricks/databricks_manifest.json`; the runbook is
`docs/DEPLOYMENT.md`.

### Step 1 — the Lakebase project (check before creating)

Determine which case you are in:

```powershell
databricks postgres list-projects --profile DatabricksFree          # live projects
databricks postgres get-project projects/omniview --profile DatabricksFree
```

- **Live** (appears in `list-projects`) → leave it alone, keep its data.
- **Soft-deleted** (absent from `list-projects`, but `get-project` returns it
  with `delete_time`/`purge_time`) → **undelete, do not create**:
  `databricks postgres undelete-project projects/omniview`. This restores the
  project with its data, `uid` and endpoint host intact.
- **Absent entirely** → `databricks postgres create-project omniview`.

> **The undelete path restores data older than the app that will serve it.**
> A restored `datavault` still holds relations owned by whichever service
> principal built them, and step 3 is about to mint a *new* one. Until the first
> rebuild runs, reads of those relations fail with `permission denied`. The dbt
> `on-run-end` hook reconciles ownership automatically, so **the first Rebuild
> after an undelete is what heals it** — treat cloud reads as untrustworthy
> until that has happened, and do not mistake the error for a broken deploy.

> `create-project` fails with *"project slug already exists"* while a
> soft-deleted project holds the name. The slug stays reserved until
> `purge_time` (delete + 7 days), so within that window **undelete is the only
> way to deploy under the name `omniview`**. Check first; do not discover this
> by failing.

### Step 2 — secret scope

```powershell
databricks secrets create-scope omniview --profile DatabricksFree
$key = uv run python -c "from django.core.management.utils import get_random_secret_key as g; print(g())"
databricks secrets put-secret omniview secret-key --string-value $key --profile DatabricksFree
```

A regenerated `SECRET_KEY` invalidates existing sessions. That is expected.

### Step 3 — the app, and the two grants that follow it

```powershell
databricks apps create --json "@deploy/databricks/app_create.json" --profile DatabricksFree
```

**Every `apps create` mints a brand-new service principal** (the old one in the
manifest is now stale). Two grants must then be applied to the *new* SP, and
**skipping either one silently breaks the deploy**:

1. **Postgres role membership + role bootstrap — one command, no psql.** The new
   SP has zero privileges, so without membership in `omniview_owner` startup dies
   in `migrate` with `permission denied for schema public`. This is fully
   automated — run:

   ```powershell
   uv run python deploy/databricks/provision_db.py
   ```

   It mints a Lakebase token as the workspace user (the same mechanism the app
   uses at runtime), then idempotently: ensures the `omniview_owner` role exists
   (creating it on a from-scratch database), grants both the workspace user and
   the new app SP membership, grants the role `CREATE, CONNECT` on the database,
   hands any existing schema to it, and verifies. It reads the app name / Lakebase
   coordinates from `databricks_manifest.json` and the SP id from the **live** app,
   so it needs no arguments and works from **any** state (undelete, fresh create,
   or a re-run). This one script replaces both the old manual
   `generate-database-credential` + `psql` GRANT **and** the from-scratch
   `CREATE ROLE` / `ALTER SCHEMA ... OWNER TO` bootstrap. Never hand the schemas to
   a single identity — the script only ever uses the shared role.

2. **Workspace folder ACL** — see step 4.

### Step 4 — build, upload, grant, deploy

```powershell
uv run python deploy/databricks/build_app.py
databricks workspace import-dir dist/databricks_app "/Workspace/Users/<you>/omniview-app" --overwrite --profile DatabricksFree
```

Then grant the **new** SP `CAN_READ` on that folder, using its `object_id` from
`databricks workspace get-status`:

```powershell
databricks workspace update-permissions directories <object-id> --json '{"access_control_list":[{"service_principal_name":"<new-sp-client-id>","permission_level":"CAN_READ"}]}'
databricks apps deploy omniview --source-code-path "/Workspace/Users/<you>/omniview-app" --profile DatabricksFree
```

- Use `workspace import-dir --overwrite`, **not `databricks sync`** — sync honors
  `.gitignore`, `dist/` is ignored, so it uploads nothing and the deploy then
  fails with *"no files found"*.
- Without the folder ACL the deploy fails the same way.

### Step 5 — API scopes (full spec only)

`apps update` is a **full spec replacement**, not a merge. Sending only
`user_api_scopes` **deletes the app's `resources`**, unbinding Lakebase and the
secret scope; the app then crashes with `connection refused 127.0.0.1:5432`.
Always send resources *and* scopes together:

```python
w.apps.update('omniview', App(
    name='omniview',
    description=create['description'],
    resources=[AppResource.from_dict(r) for r in create['resources']],  # app_create.json
    user_api_scopes=update['user_api_scopes'],                          # app_update.json
))
```

### Step 6 — verify

App reports `RUNNING`; logs show `Schemas ensured`, migrations, gunicorn
listening, and **no** `permission denied for schema public`; the app URL returns
a 302 to the Databricks OAuth door.

### Step 7 — the ownership tripwire

Schema-level checks are not enough: the schemas can be correctly owned while the
relations inside them are not. The provisioning script's `--verify` mode asserts
this for you — read-only, no changes:

```powershell
uv run python deploy/databricks/provision_db.py --verify
```

It prints whether the app SP is a member of `omniview_owner` and the per-schema
object-owner counts for `omniview` and `datavault`. Interpretation:

- **`omniview_owner=<n>` only, on both schemas** → correct.
- **A service-principal GUID** → objects predate the `on-run-end` hook, or were
  built before the current SP existed. A Rebuild fixes it; verify afterwards.
- **A GUID that is not the current SP** → the app cannot read or drop them. It
  will fail at the first page load or Rebuild.

`no relations yet` for `datavault` immediately after an undelete-and-deploy is
fine only if no rebuild has run yet. Report the result either way — this failure
is otherwise silent until a user clicks something.

**If relations are stranded under a dead SP, they cannot be repaired in place.**
`REASSIGN OWNED` and `ALTER ... OWNER TO` both require membership in the *owning*
role, and nobody holds that once the SP is gone. The only recovery is to discard
the schema, which works because schema ownership is independent of object
ownership:

```sql
DROP SCHEMA datavault CASCADE;
CREATE SCHEMA datavault AUTHORIZATION omniview_owner;
```

`datavault` is fully derived from the `omniview` source rows, so this loses
nothing — then Rebuild. Confirm with the user first; it is destructive DDL
against production and may require an explicit permission grant to run.

### The cloud warehouse

**Never run the pipeline or dbt against Lakebase with your own credentials** —
the tables would be owned by your role and the app's in-app Rebuild (running as
the service principal) could no longer drop and recreate them. Loading *source
rows* with your credentials is fine; you only insert.

Building `datavault` in the cloud is done by clicking **Rebuild** on the Budget
page. That needs a browser, so hand it to the user rather than attempting it.

### Afterwards

If the SP changed, update `app_service_principal_client_id` in
`deploy/databricks/databricks_manifest.json`. Note also that each recreate
leaves the previous SP's Postgres role behind as a member of `omniview_owner`,
and leaves an orphaned `/Users/<old-sp-id>/` workspace home whose root is
platform-protected and cannot be deleted via the API.

---

## Tests

Ask before running. All three tiers, in this order — the E2E tier needs the
compose `db` service up:

```powershell
uv run pytest                     # backend: 254 tests, in-memory SQLite
cd frontend; npm run test         # vitest: 137 tests
cd frontend; npm run e2e          # playwright: 17 tests, drops/recreates omniview_e2e
```

If Playwright reports a missing browser, run
`npx playwright install --with-deps chromium` first.

E2E runs against a dedicated `omniview_e2e` database on port 8100 and never
touches the real `omniview` database or `Data/`.

Report pass/fail per tier honestly. If a tier fails, say so with the output and
stop rather than continuing to the cleanup question.

## Test artifact cleanup

Only ask if tests actually ran. These are what the suites create, all
regenerable:

| Artifact | From |
|---|---|
| `omniview_e2e` database | `e2e_bootstrap` |
| `backend/.e2e/` | E2E scratch dir |
| `frontend/test-results/`, `frontend/playwright-report/` | Playwright |
| `.pytest_cache/`, `**/__pycache__/` | pytest / CPython |

Delete only these, by exact path. **Never** touch `Data/`, the real `omniview`
database, `docker/.env`, or the deployment itself.

## Finish

Ask whether to invoke **`generate-artifact-manifest`** to refresh
`docs/ARTIFACTS.md` against what was just deployed. It is a good moment for it:
the infrastructure is live, so a survey now captures real state rather than
declarations — and if the cloud SP changed, the previous manifest is stale.

If yes, invoke that skill. If no, report what was deployed and tested, and stop.
