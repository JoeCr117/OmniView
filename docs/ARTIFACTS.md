# OmniView — Artifact Manifest

Every resource the OmniView project **creates**, so the `teardown` skill can destroy
exactly these and nothing else. Generated **2026-08-04** by surveying the project
immediately after deploying `feature/omni-erd-enhancements` to Databricks.

**Probed live this run:** local Docker (`ps -a`, `images`, `volume ls`, `network ls`),
the local Postgres cluster via the `db` container's `psql` (databases, roles, object
counts by `relkind`, runtime row counts), **the cloud Lakebase over a read-only psql
connection** (object counts, every role, `omniview_owner` membership, runtime row
counts), `databricks apps get`, `secrets list-scopes`, `secrets list-secrets`,
`workspace list /Users`, `provision_db.py --verify`, host TCP listeners on
8000/8010/8021/8100, and generated-path existence **across all three worktrees**.

**Read from declarations / delegated:** the cloud resource *list* itself, which belongs
to `deploy/databricks/databricks_manifest.json` and is not copied here.

---

## 1. Scope and boundaries

An **artifact** is something a build/deploy/run of OmniView brought into existence:
Docker objects, the local Postgres cluster and its contents, the Databricks cloud stack
and the data inside it, generated build output, and — new this run — **the sibling git
worktrees** and the throwaway databases they stood up.

**Excluded by design** (see §3): `Data/` (production source data the project *reads*),
pulled base images, the pre-existing Databricks SQL warehouse, local secret files a
human authored, and one unattributed Docker volume this project cannot prove it created.

**Two authorities this file points at rather than copies:**
- **Cloud resources** → `deploy/databricks/databricks_manifest.json`, destroyed in order
  by `deploy/databricks/tear_down.py`.
- **Local containers/volumes/networks** → `docker/docker-compose.yml` (compose project
  name pinned to `omniview`).

---

## 2. Inventory

### 2.1 Git worktrees — DESTROYABLE (new this run)

The project now spans **three** working directories, two of them sibling worktrees added
for concurrent feature teams. Each carries its own provisioned toolchain, which is what
triples the generated-file footprint in §2.7.

| Worktree | Branch | Live state |
|---|---|---|
| `W:\Projects\Claude Projects\OmniView` | `master` | The real repo. **Never a teardown target** — it is the source. |
| `W:\Projects\Claude Projects\OmniView-omni-erd` | `feature/omni-erd-enhancements` | At `9900c95` + uncommitted feature work. |
| `W:\Projects\Claude Projects\OmniView-expense-tracker` | `feature/expense-tracker-enhancements` | At `9900c95` + uncommitted feature work. |

> **Both feature worktrees hold uncommitted work that exists in no commit.** `git
> worktree remove` would destroy it irrecoverably. They are listed here so teardown
> *recognizes* them, but see §4 — they rank alongside the cloud data as the least
> recoverable things in this project today.

### 2.2 Docker (compose project `omniview`) — DESTROYABLE

| Kind | Name | Live state 2026-08-04 |
|---|---|---|
| Image (built) | `omniview-app:latest` | 945 MB, built from `docker/Dockerfile`, 8 days old. |
| Container | `omniview-app-1` | **Exited (255) 5 days ago.** Port mapping `0.0.0.0:8010→8000` is declared but nothing is listening. Stateless. |
| Container | `omniview-db-1` | `postgres:17-alpine`, **healthy**, `127.0.0.1:5432`. |
| Volume | `omniview-pgdata` | **The local Postgres cluster** (§2.3/§2.5). The only stateful local artifact. |
| Network | `omniview_default` | Compose default bridge. |

`postgres:17-alpine` (pulled) and one dangling anonymous volume are **protected** — §3.

### 2.3 Local databases & schema objects — DESTROYABLE (inside `omniview-pgdata`)

Cluster user: `omniview` (the **only** non-system role locally — there is no
`omniview_owner`, which is why startup logs `Ownership skipped`). **Four** databases,
two more than the previous manifest recorded:

| Database | Live objects | Provenance |
|---|---|---|
| `omniview` | `omniview` 19 tables / 18 sequences / 61 indexes; `datavault` 12 tables / 10 views / 10 indexes | The real local dev database. |
| `omniview_erd_review` | `omniview` 20 tables / 19 sequences / 65 indexes; `datavault` 5 tables | **Throwaway**, created 2026-08-04 for the local sign-off standup on port 8021 (§2.6) because migration `0003` is unapplied in `omniview`. `datavault` is hand-seeded, not pipeline-built. |
| `omniview_erd_dev` | `omniview` 20 tables; `datavault` 6 tables | **Throwaway orphan.** Predates this session, attributable to no document. Same shape as the review database — almost certainly an earlier scratch standup that was never cleaned up. |
| `postgres` | — | Cluster default, not created by this project. |

> **`omniview` (the real one) is one migration behind the branch:**
> `to_regclass('omniview.omnierd_relationshipoverride')` returns NULL — migration
> `omni_erd.0003` has **not** been applied there, which is exactly why the sign-off
> standup needed its own database. The cloud *has* the table (§2.5).

`omniview_e2e` is absent — created and dropped by every `npm run e2e`; dropped again
after this run's suite passed.

### 2.4 Identities & access — DESTROYABLE

**Local:** Postgres superuser `omniview` (compose `POSTGRES_USER`, password
`omniview-dev`). Confirmed the only non-system role.

**Cloud (live-probed):** the shared `omniview_owner` role (NOLOGIN) owns both schemas
and all 42 relations. Members: the workspace user plus **seven** service-principal
roles — the current app SP `fe5c973c-…` plus six stale ones from earlier `apps create`
runs. The stale roles own nothing and die with the Lakebase project; no teardown step
targets them.

Two live oddities, both harmless and recorded so they are not re-investigated:
- **`JoeCr117@gmail.com` appears twice** in `omniview_owner`'s membership — two grant
  paths (the original manual grant and `provision_db.py`) each left a row. Idempotent
  in effect.
- **Six orphaned `/Users/<sp-id>/` workspace homes** exist, one fewer than the seven SP
  roles. Their roots are platform-protected — §3.

### 2.5 Runtime records — DESTROYABLE with their store

Created by normal use; listed so a record-level cleanup is possible and so the
irreversible ones are visible.

| Record | Local `omniview` | Local `omniview_erd_review` | Cloud (live) |
|---|---|---|---|
| `auth_user` | **1** | 1 (`erdreview`) | **1** |
| `django_session` | **3** | — | **5** |
| `rawdata_rawfile` | 8 | — | 8 |
| `budgets_budgetmapdocument` | 1 | — | 1 |
| `omnierd_erdlayout` | 0 | — | **2** |
| `omnierd_relationshipoverride` | *table absent* | 0 | 0 |
| `adminportal_appaccess` | 0 | — | 0 |
| `socialaccount_socialaccount` | — | — | 0 |

**Changed since 2026-07-26:** the local database was previously 0 users / 0 sessions,
and the manifest concluded "nothing local is irrecoverable." That is **no longer true** —
a local account now exists and exists in no file. See §4.

The CSV and budget-map rows re-import from `Data/`. **The bolded rows do not.**

### 2.6 Running processes — DESTROYABLE

| What | Where | Live state |
|---|---|---|
| Sign-off review server | host `127.0.0.1:8021`, PID 4348 | `manage.py runserver` from the omni-erd worktree, serving the static export single-origin against `omniview_erd_review`. **Still running** pending user sign-off. |

Nothing is listening on **8000** (no production container exists — see §3), **8010**
(the compose app is exited) or **8100** (E2E is not running).

### 2.7 Cloud (Databricks) — DESTROYABLE via dedicated tooling

**Do not enumerate here.** The authority is `deploy/databricks/databricks_manifest.json`
(app `omniview`, Lakebase `projects/omniview`, secret scope `omniview`, workspace folder
`/Workspace/Users/JoeCr117@gmail.com/omniview-app`), destroyed by
`deploy/databricks/tear_down.py`.

Live state this run, after the 2026-08-04 redeploy: app `omniview` compute `ACTIVE`,
deployment `SUCCEEDED`, URL 302s to the OAuth door; SP unchanged at `fe5c973c-…`;
`user_api_scopes` `["sql"]`; secret scope `omniview` holding `secret-key`; Lakebase
`omniview` schema **20 relations** (19 + the new `omnierd_relationshipoverride`) and
`datavault` **22**, all owned by `omniview_owner` with nothing stranded. The **data
inside** the Lakebase is protected — §3.

### 2.8 Generated files — DESTROYABLE (existence verified this run, per worktree)

| Path | `OmniView` | `-omni-erd` | `-expense-tracker` | Rebuild |
|---|---|---|---|---|
| `.venv/` | ✓ | ✓ | ✓ | `uv sync` |
| `frontend/node_modules/` | ✓ | ✓ | ✓ | `npm install` |
| `frontend/out/`, `frontend/.next/` | ✓ | ✓ | — | `npm run build` |
| `backend/staticfiles/` | ✓ | ✓ | — | `collectstatic` |
| `dist/databricks_app/` | ✓ | ✓ (594 files, 13.4 MB) | — | `build_app.py` |
| `pipelines/expense_tracker/dbt/{target,logs,dbt_packages}/` | ✓ | — | — | next dbt run |
| `.pytest_cache/` | ✓ | — | ✓ | next pytest run |

**Absent this run** (deleted after the E2E tier passed; listed so teardown recognizes
them if they return): `**/__pycache__/`, `frontend/test-results/`,
`frontend/playwright-report/`, `backend/.e2e/`, and the `omniview_e2e` database.

---

## 3. Protected — never destroy

| Artifact | Reason |
|---|---|
| **`Data/`** (bank CSVs + BudgetMap) | **Production source data** and the one-time import source. Both `omniview` schemas are re-derived from it; it is authored, not generated. Tests never touch it. |
| **Cloud data inside Lakebase `projects/omniview`** | Real production data. The CSVs and budget map re-import from `Data/`, but the **1 user account, 5 sessions and 2 saved ERD layouts probed live this run exist nowhere else**. Deletion soft-deletes with a 7-day grace — §4. |
| **Uncommitted work in the two feature worktrees** | Two features (relationship overrides + generated SELECT; the versioned Golden1 parser) exist **only** as working-tree changes at `9900c95`. No commit holds them. Do not `git worktree remove` either one until both are committed. |
| **`W:\Projects\Claude Projects\OmniView` itself** | The repository. It is the source every other artifact is derived from. |
| **`postgres:17-alpine`** | Pulled shared base image, not built here. |
| **Anonymous volume `2e62bdb188af…`** | Created 2026-07-21, no labels, **no container references it**, nothing ties it to this project. Unattributable ⇒ protected. Do not sweep it up with `docker volume prune`. |
| **The SQL warehouse** (`sql_warehouse_id` in the deploy manifest) | Pre-existing Serverless Starter Warehouse — **not created** by this deployment; the Admin Portal only reads it. |
| **`frontend/.env.development.local`** (present in `OmniView`) | Local config a human set (`NEXT_PUBLIC_API_BASE_URL`). Not generated. `docker/.env` is absent in all three worktrees; never delete it if it appears. |
| **Orphaned `/Users/<sp-id>/` workspace homes** (6 live) | Roots are platform-protected; the API cannot delete them. Not destroyable, so not a teardown target. |

> **Port 8000 — the protection still has no object.** As at the previous run, `docker ps
> -a` shows no production container and nothing is listening on 8000. The *convention*
> stands (dev-verify on 8010/8021/8100, never bind 8000) in case it is restored, but
> there is nothing there for teardown to avoid today.

---

## 4. Reversibility (most → least recoverable)

1. **Generated files (§2.8)** — fully rebuildable from source with the listed commands.
   Three worktrees' worth, but all mechanical.
2. **`omniview_e2e` database** — dropped and recreated by `e2e_bootstrap` on every run.
3. **Throwaway databases `omniview_erd_review` and `omniview_erd_dev`** — fully
   disposable. `erd_review` is re-derivable by re-running the standup; `erd_dev` has no
   documented owner and nothing references it.
4. **Local `omniview` DB / `omniview-pgdata` volume** — **now only partly recoverable.**
   Schemas and source rows re-derive (`ensure_schemas` → `migrate` →
   `import_banks_dir ..\Data\Banks` → the pipeline), but the **1 local user account and
   3 sessions do not** — they exist in no file, and with `docker/.env` absent, nothing
   recreates the account automatically. `manage.py createsuperuser` is the manual route.
   *(This is a change from 2026-07-26, when the local side was fully re-derivable.)*
5. **Cloud `datavault`** — derived. Rebuilt only by the in-app **Rebuild** button (which
   runs as the SP; never run dbt against Lakebase as yourself). Not rebuilt since before
   this deploy.
6. **Cloud `omniview` schema data** — **partially irrecoverable.** Source rows re-import
   from `Data/`; the user account, 5 sessions and 2 cloud-authored ERD layouts do not.
   *Grace period:* `databricks postgres delete-project` **soft-deletes** —
   `databricks postgres undelete-project projects/omniview` restores data, `uid` and
   endpoint host intact until `purge_time` (delete + 7 days), and the slug stays reserved
   until then, so undelete is the *only* route back inside that window. After purge, both
   the data and the name are gone.
7. **Cloud `SECRET_KEY`** — regenerable but **not to the same value**; regenerating
   invalidates every existing session. It exists only in the secret scope.
8. **Uncommitted feature work in the two worktrees** — **irrecoverable by any command in
   this project.** No commit, no stash, no remote holds it. Ranked last deliberately: it
   is the only artifact here whose loss cannot be undone even with a grace period.

---

## 5. Teardown ordering

Consumers before dependencies; disconnect before drop; derived before source; delegate
where purpose-built tooling exists.

1. **Commit or abandon the feature branches first.** Nothing else in this list is
   destructive to work-in-progress, and this step is not reversible — §4.8.
2. **Stop host processes.** The port-8021 review server (§2.6) holds a connection to
   `omniview_erd_review`.
3. **Cloud — delegate.** `uv run python deploy/databricks/tear_down.py` (profile
   `DatabricksFree`). It removes, in order: the app (with its SP and resource bindings)
   → the workspace folder → the secret scope → the Lakebase project (soft-delete, 7-day
   purge). Do not hand-delete cloud resources.
4. **Local app before DB.** `docker compose -f docker/docker-compose.yml down` stops
   `omniview-app-1` before `omniview-db-1`.
5. **Local stateful objects.** Remove volume `omniview-pgdata` (this also removes the
   `omniview`, `omniview_erd_review`, `omniview_erd_dev` and any `omniview_e2e`
   databases) and network `omniview_default` — `down -v` does both. Never
   `docker volume prune`; it would take the protected anonymous volume with it.
6. **Local image.** Remove `omniview-app:latest`. Leave `postgres:17-alpine`.
7. **Worktrees.** `git worktree remove` the two siblings — only after step 1.
8. **Generated files (§2.8).** Delete by exact path only, in each worktree.

Never included in any step: everything in §3.

---

This manifest is what the **`teardown`** skill consumes: invoking it destroys every
artifact listed above, restricts itself to exactly that list, takes no backups, and
finishes by deleting this file. Regenerating the manifest is routine maintenance and does
not imply a teardown should follow.
