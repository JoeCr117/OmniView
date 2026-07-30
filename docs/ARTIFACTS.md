# OmniView — Artifact Manifest

Every resource the OmniView project **creates**, so the `teardown` skill can destroy
exactly these and nothing else. Generated **2026-07-26** by surveying the project
immediately after a full local + cloud rebuild.

**Probed live this run:** local Docker (`images`, `ps -a`, `volume ls`, `network ls`,
`volume inspect`), the local Postgres cluster via the `db` container's `psql`
(databases, schemas, object counts by `relkind`, roles, runtime row counts),
host TCP listeners on port 8000, generated-path existence, and — new this run —
**the cloud Lakebase internals over a live psql connection** (schemas and their
owners, object counts, every role, `omniview_owner` membership, runtime row counts),
plus `databricks apps list`, `secrets list-scopes` and `workspace list /Users`.

**Read from declarations / delegated:** the cloud resource *list* itself, which
belongs to `deploy/databricks/databricks_manifest.json` and is not copied here.

---

## 1. Scope and boundaries

An **artifact** is something a build/deploy/run of OmniView brought into existence:
Docker objects, the local Postgres cluster and its contents, the Databricks cloud
stack and the data inside it, and generated build output.

**Excluded by design** (see §3): `Data/` (production source data the project *reads*),
pulled base images, the pre-existing Databricks SQL warehouse, and one unattributed
Docker volume this project cannot prove it created.

**Two authorities this file points at rather than copies:**
- **Cloud resources** → `deploy/databricks/databricks_manifest.json`, destroyed in
  order by `deploy/databricks/tear_down.py`.
- **Local containers/volumes/networks** → `docker/docker-compose.yml` (compose project
  name pinned to `omniview`).

---

## 2. Inventory

### 2.1 Docker (compose project `omniview`) — DESTROYABLE

| Kind | Name | Live state 2026-07-26 |
|---|---|---|
| Image (built) | `omniview-app:latest` | 945 MB, built from `docker/Dockerfile`. |
| Container | `omniview-app-1` | Up, `0.0.0.0:8010→8000`. Stateless. |
| Container | `omniview-db-1` | `postgres:17-alpine`, healthy, `127.0.0.1:5432`. |
| Volume | `omniview-pgdata` | **The local Postgres cluster** (§2.2/§2.4). The only stateful local artifact. Recreated empty this run — the previous volume was gone. |
| Network | `omniview_default` | Compose default bridge. |

`postgres:17-alpine` (pulled) and one dangling anonymous volume are **protected** — §3.

### 2.2 Local databases & schema objects — DESTROYABLE (inside `omniview-pgdata`)

Cluster user/database: `omniview`. One database: **`omniview`** (`omniview_e2e` was
created by this session's E2E run and has already been dropped; it reappears on every
`npm run e2e`).

| Schema | Live objects | Built by |
|---|---|---|
| `omniview` | 19 tables, 18 sequences, 61 indexes | `manage.py ensure_schemas` + `migrate` |
| `datavault` | 12 tables, 10 views, 10 indexes | 5 `stg_*` tables staged by the Python layer + 17 dbt models (`PASS=18`) |

Schema objects are **derived**, not authored — they live and die with the volume and
are not listed individually.

### 2.3 Identities & access — DESTROYABLE

**Local:** Postgres superuser `omniview` (compose `POSTGRES_USER`, password
`omniview-dev`). Confirmed the *only* non-system role in the local cluster — no
`omniview_owner` locally, which is why startup logs `Ownership skipped: role
'omniview_owner' does not exist (single-owner deployment)`.

**Cloud (live-probed):** the shared `omniview_owner` role (NOLOGIN) owns both schemas
and all 41 relations. Its members are the workspace user and **seven**
service-principal roles — the current app SP plus six stale ones from earlier
`apps create` runs (each recreate mints a new SP; the manifest's redeploy log has the
ids). The stale roles own nothing and die with the Lakebase project; no teardown step
targets them. Five of them also left orphaned `/Users/<sp-id>/` workspace homes, whose roots
are platform-protected and cannot be deleted via the API.

### 2.4 Runtime records — DESTROYABLE with their store

Created by normal use; listed so a record-level cleanup is possible and so the
irreversible ones are visible.

| Record | Local | Cloud (live) |
|---|---|---|
| `auth_user` | 0 | **1** |
| `django_session` | 0 | **5** |
| `rawdata_rawfile` | 8 | 8 |
| `budgets_budgetmapdocument` | 1 | 1 |
| `omnierd_erdlayout` | 0 | **2** |
| `adminportal_appaccess` | 0 | 0 |
| `socialaccount_socialaccount` | — | 0 |

The local rows came from `import_banks_dir ..\Data\Banks` this run and are
re-importable. **The bolded cloud rows exist in no file** — see §4.

### 2.5 Cloud (Databricks) — DESTROYABLE via dedicated tooling

**Do not enumerate here.** The authority is `deploy/databricks/databricks_manifest.json`
(app `omniview`, Lakebase project `projects/omniview`, secret scope `omniview`,
workspace folder `/Workspace/Users/<your-workspace-user>/omniview-app`), destroyed by
`deploy/databricks/tear_down.py`.

Live state this run: app `omniview` — compute `ACTIVE`, deployment `SUCCEEDED`, URL
302s to the Databricks OAuth door; secret scope `omniview` present holding
`secret-key`; Lakebase `projects/omniview` restored from soft-delete with `uid`
`be2bfc1a-…` and endpoint host intact. The **data inside** the Lakebase is protected —
§3.

### 2.6 Generated files — DESTROYABLE (existence verified this run)

| Path | Source | Rebuild |
|---|---|---|
| `.venv/` | `uv sync` | `uv sync` |
| `frontend/node_modules/` | `npm install` | `npm install` |
| `frontend/out/`, `frontend/.next/` | `next build` | `npm run build` |
| `backend/staticfiles/` | `collectstatic` | `build_app.py` |
| `dist/databricks_app/` | `build_app.py` | `build_app.py` (12.6 MB, 581 files) |
| `pipelines/expense_tracker/dbt/target/` | dbt build | next dbt run |
| `pipelines/expense_tracker/dbt/logs/` | dbt build | next dbt run |
| `pipelines/expense_tracker/dbt/dbt_packages/` | `dbt deps` | next dbt run |

**Absent this run** (deleted after the test tiers passed; listed so teardown recognizes
them if they return): `.pytest_cache/`, `**/__pycache__/`, `frontend/test-results/`,
`frontend/playwright-report/`, `backend/.e2e/`, and the `omniview_e2e` database.

---

## 3. Protected — never destroy

| Artifact | Reason |
|---|---|
| **`Data/`** (bank CSVs + BudgetMap) | **Production source data** and the one-time import source. Both `omniview` schemas are re-derived from it; it is authored, not generated. Tests never touch it. |
| **Cloud data inside Lakebase `projects/omniview`** | Real production data. The CSVs and budget map re-import from `Data/`, but the **1 user account, 5 sessions and 2 saved ERD layouts probed live this run exist nowhere else**. Deletion soft-deletes with a 7-day grace — §4. |
| **`postgres:17-alpine`** | Pulled shared base image, not built here. |
| **Anonymous volume `2e62bdb188af…`** | Created 2026-07-21, no labels, **no container references it**, and nothing ties it to this project. Unattributable ⇒ protected. Do not sweep it up with a `docker volume prune`. |
| **The SQL warehouse** (`sql_warehouse_id` in the manifest) | Pre-existing Serverless Starter Warehouse — **not created** by this deployment; the Admin Portal only reads it. |
| **`docker/.env`, `frontend/.env.local`** (if present) | Local secrets a human set. Both absent this run; never delete if they appear. |
| **Orphaned `/Users/<sp-id>/` workspace homes** | Roots are platform-protected; the API cannot delete them. Not destroyable, so not a teardown target. |

> **Reclassified this run:** the **port-8000 production container**, protected by every
> previous manifest, **no longer exists** — `docker ps -a` shows no such container and
> nothing is listening on port 8000. The protection now has no object. The *convention*
> still stands (dev-verify on 8010/8100, never bind 8000) in case the user restores it,
> but there is nothing on port 8000 for teardown to avoid today.

---

## 4. Reversibility (most → least recoverable)

1. **Generated files (§2.6)** — fully rebuildable from source with the listed commands.
2. **`omniview_e2e` database** — dropped and recreated by `e2e_bootstrap` on every run.
3. **Local `omniview` DB / `omniview-pgdata` volume** — fully re-derivable:
   `ensure_schemas` → `migrate` → `import_banks_dir ..\Data\Banks` → the pipeline.
   **Nothing local is irrecoverable** — verified this run: 0 users, 0 sessions,
   0 ERD layouts, and the 9 source rows all came from `Data/`.
4. **Cloud `datavault`** — derived. Rebuilt only by the in-app **Rebuild** button
   (which runs as the SP; never run dbt against Lakebase as yourself).
5. **Cloud `omniview` schema data** — **partially irrecoverable.** Source rows
   re-import from `Data/`; the user account, sessions and cloud-authored ERD layouts do
   not. *Grace period:* `databricks postgres delete-project` **soft-deletes** —
   `databricks postgres undelete-project projects/omniview` restores data, `uid` and
   endpoint host intact until `purge_time` (delete + 7 days), and the slug stays
   reserved until then, so undelete is the *only* route back inside that window. This
   run exercised exactly that path. After purge, both the data and the name are gone.
6. **Cloud `SECRET_KEY`** — regenerable but **not to the same value**; regenerating it
   invalidates every existing session. It exists only in the secret scope.

---

## 5. Teardown ordering

Consumers before dependencies; disconnect before drop; derived before source; delegate
where purpose-built tooling exists.

1. **Cloud first — delegate.** `uv run python deploy/databricks/tear_down.py`
   (profile `DatabricksFree`). It removes, in order: the app (with its SP and resource
   bindings) → the workspace folder → the secret scope → the Lakebase project
   (soft-delete, 7-day purge). Do not hand-delete cloud resources.
2. **Local app before DB.** `docker compose -f docker/docker-compose.yml down` stops
   `omniview-app-1` before `omniview-db-1`.
3. **Local stateful objects.** Remove volume `omniview-pgdata` (this also removes
   `omniview_e2e` if it exists) and network `omniview_default` —
   `docker compose -f docker/docker-compose.yml down -v` does both. Never
   `docker volume prune`; it would take the protected anonymous volume with it.
4. **Local image.** Remove `omniview-app:latest`. Leave `postgres:17-alpine`.
5. **Generated files (§2.6).** Delete by exact path only.

Never included in any step: everything in §3.

---

This manifest is what the **`teardown`** skill consumes: invoking it destroys every
artifact listed above, restricts itself to exactly that list, takes no backups, and
finishes by deleting this file. Regenerating the manifest is routine maintenance and
does not imply a teardown should follow.
