# OmniView — Artifact Manifest

Every resource the OmniView project **creates**, so the `teardown` skill can destroy
exactly these and nothing else. Generated **2026-08-16** by surveying the project
immediately after a full local deploy, all three test tiers and the `quality/`
measurement suite.

**Probed live this run:** local Docker (`ps -a`, `images`, `volume ls`, `network ls`),
the local Postgres cluster via the `db` container's `psql` (databases, sizes, roles,
object counts by `relkind`, runtime row counts), `git worktree list`, host TCP listeners
on 8000/8010/8021/8100, and generated-path existence.

**Read from declarations / delegated:** the cloud resource list, which belongs to
`deploy/databricks/databricks_manifest.json` and is not copied here.

> **The cloud was NOT verified live this run.** Every `databricks` call failed with
> *"A new access token could not be retrieved because the refresh token is invalid"* on
> profile `DatabricksFree`. §2.6 is therefore **declared state, not observed state**. Run
> `databricks auth login --profile DatabricksFree` and re-run this skill if you need the
> cloud section trusted.

---

## 1. Scope and boundaries

An **artifact** is something a build/deploy/run of OmniView brought into existence:
Docker objects, the local Postgres cluster and its contents, the Databricks cloud stack
and the data inside it, and generated build/test output.

**Excluded by design** (see §3): `Data/` (production source data the project *reads*),
pulled base images, the pre-existing Databricks SQL warehouse, the three git-ignored
deployment-state files a human authored, and one unattributable Docker volume.

**Two authorities this file points at rather than copies:**
- **Cloud resources** → `deploy/databricks/databricks_manifest.json`, destroyed in order
  by `deploy/databricks/tear_down.py`.
- **Local containers/volumes/networks** → `docker/docker-compose.yml` (compose project
  name pinned to `omniview`).

---

## 2. Inventory

### 2.1 Git worktrees — NONE (changed this run)

`git worktree list` reports **one** working directory:
`W:\Projects\Claude Projects\OmniView` at `b61b0f9 [master]`, working tree clean apart
from one untracked file (§2.7).

The two sibling feature worktrees the previous manifest listed
(`OmniView-omni-erd`, `OmniView-expense-tracker`) **no longer exist**, and their work is
merged into `master`. **The protection covering their uncommitted work is retired** — it
has no object, and carrying it forward would be exactly the stale protection this survey
is meant to catch.

### 2.2 Docker (compose project `omniview`) — DESTROYABLE

| Kind | Name | Live state 2026-08-16 |
|---|---|---|
| Image (built) | `omniview-app:latest` | **1.27 GB**, rebuilt this run from `docker/Dockerfile`. Was 945 MB on 2026-08-04. |
| Container | `omniview-app-1` | **Up**, `0.0.0.0:8010→8000`. Stateless. |
| Container | `omniview-db-1` | `postgres:17-alpine`, **healthy**, `127.0.0.1:5432`. |
| Volume | `omniview-pgdata` | **The local Postgres cluster** (§2.3/§2.4). The only stateful local artifact. |
| Network | `omniview_default` | Compose default bridge. |

`postgres:17-alpine` (pulled) and one anonymous volume are **protected** — §3.

### 2.3 Local databases & schema objects — DESTROYABLE (inside `omniview-pgdata`)

Cluster user `omniview` is the **only** non-system role locally — there is no
`omniview_owner`, which is why startup logs `Ownership skipped`.

**One project database**, down from four on 2026-08-04:

| Database | Size | Live objects | Provenance |
|---|---|---|---|
| `omniview` | 12 MB | `omniview` **20 tables** / 19 sequences / 65 indexes; `datavault` 12 tables / 10 views / 10 indexes | The real local dev database. |
| `postgres`, `template0`, `template1` | — | — | Cluster defaults, not created by this project. |

Two divergences from the previous manifest, both **resolved**:
- **`omniview_erd_review` and `omniview_erd_dev` are gone.** The throwaway standup
  database and the unattributed orphan no longer exist.
- **`omniview` is no longer a migration behind.** It now carries 20 tables including
  `omnierd_relationshipoverride`; migration `omni_erd.0003` is applied.

`omniview_e2e` is absent — created by `e2e_bootstrap` on every `npm run e2e` and dropped
after this run's suite passed.

> **`datavault` is incomplete by one relation.** `gold_Golden1_BudgetAnalysis` did not
> build: the dbt data test `CatToSubCatSums` fails because the Travel category budget
> (390) is below its subcategory total (440) in the budget map. Purely a data condition —
> the same `dbt build` passes 24/24 against `docs/examples/Banks`. Fixing the budget on
> the Budget Map page and hitting Rebuild completes the schema. Nothing about teardown
> changes; recorded so a future reader does not read 22 relations as corruption.

### 2.4 Identities & access — DESTROYABLE

**Local:** Postgres superuser `omniview` (compose `POSTGRES_USER`, password
`omniview-dev`). Verified the only non-system role.

**Cloud:** the shared `omniview_owner` role (NOLOGIN) owning both schemas, plus the app
service-principal roles. **Not verified this run** — see the auth note at the top. Per
`databricks_manifest.json`, the role lives inside the Lakebase project and dies with it;
no teardown step targets it. Stale SP roles from earlier `apps create` runs own nothing
and die with the project too.

### 2.5 Runtime records — DESTROYABLE with their store

Created by normal use; listed so a record-level cleanup is possible and so the
irreversible ones are visible.

| Record | Local `omniview` | Δ since 2026-08-04 |
|---|---|---|
| `auth_user` | **1** | — |
| `django_session` | **2** | 3 → 2 |
| `rawdata_rawfile` | 12 | 8 → 12 (re-imported from `Data/Banks`) |
| `budgets_budgetmapdocument` | 1 | — |
| `omnierd_erdlayout` | 0 | — |
| `omnierd_relationshipoverride` | 0 | table now exists (was absent) |
| `adminportal_appaccess` | 0 | — |
| `socialaccount_socialaccount` | 0 | — |

The CSV and budget-map rows re-import from `Data/`. **The bolded rows do not** — the
local account and its sessions exist in no file. See §4.

### 2.6 Cloud (Databricks) — DESTROYABLE via dedicated tooling — **DECLARED, NOT VERIFIED**

**Do not enumerate here.** The authority is `deploy/databricks/databricks_manifest.json`
(app `omniview`, Lakebase `projects/omniview`, secret scope `omniview`, workspace folder
`/Workspace/Users/JoeCr117@gmail.com/omniview-app`), destroyed by
`deploy/databricks/tear_down.py`.

Last *observed* state was 2026-08-04 (app compute `ACTIVE`, SP `fe5c973c-…`,
`user_api_scopes ["sql"]`, `omniview` 20 relations / `datavault` 22, all owned by
`omniview_owner`, nothing stranded). **This run could not confirm any of it** — the OAuth
refresh token for profile `DatabricksFree` is invalid. Treat the cloud as unsurveyed:
the app may have auto-stopped on Free Edition idle, and the Lakebase project may be live
or soft-deleted. The **data inside** the Lakebase is protected — §3.

### 2.7 Generated files — DESTROYABLE (existence verified this run)

| Path | Present | Rebuild |
|---|---|---|
| `.venv/` | ✓ | `uv sync` |
| `frontend/node_modules/` | ✓ | `npm install` |
| `frontend/out/`, `frontend/.next/` | ✓ | `npm run build` |
| `pipelines/expense_tracker/dbt/{target,logs,dbt_packages}/` | ✓ | next dbt run |
| `quality/reports/` | ✓ | the commands in `quality/README.md` |
| `bash.exe.stackdump` (repo root) | ✓ | crash debris; nothing recreates it |
| `backend/staticfiles/` | — | `collectstatic` |
| `dist/databricks_app/` | — | `deploy/databricks/build_app.py` |
| `.pytest_cache/`, `**/__pycache__/` | — | next pytest run |
| `frontend/test-results/`, `frontend/playwright-report/` | — | next Playwright run |
| `backend/.e2e/` | — | `e2e_bootstrap` |

Absent entries are listed so teardown recognizes them if they return. The bottom five
groups were deleted deliberately at the end of this run's test pass.

**`quality/reports/baseline-audit.md` is committed source, not generated output** — only
the raw tool dumps beside it (`complexipy-results.json`, `jscpd/`, `schemathesis*`) are
regenerable. Do not delete the directory wholesale.

### 2.8 Running processes — DESTROYABLE

| Port | State | What |
|---|---|---|
| 8010 | **LISTENING** | `omniview-app-1` (the compose stack). |
| 8000 | free | No production container exists — §3. |
| 8021 | free | The 2026-08-04 sign-off review server is gone. |
| 8100 | free | E2E is not running. |

---

## 3. Protected — never destroy

| Artifact | Reason |
|---|---|
| **`Data/`** (bank CSVs + BudgetMap) | **Production source data** and the one-time import source. Both `omniview` schemas are re-derived from it; it is authored, not generated. It names a real person's employer, landlord, insurers and medical providers. Tests never touch it. |
| **Cloud data inside Lakebase `projects/omniview`** | Real production data. CSVs and the budget map re-import from `Data/`, but any cloud-authored account, session or saved ERD layout exists nowhere else. Deletion soft-deletes with a 7-day grace — §4. |
| **`W:\Projects\Claude Projects\OmniView` itself** | The repository. It is the source every other artifact is derived from. |
| **`postgres:17-alpine`** | Pulled shared base image, not built here. |
| **Anonymous volume `2e62bdb188af…`** | Created 2026-07-21, no labels, **no container references it**, nothing ties it to this project. Still unattributable after a second survey ⇒ still protected. Do not sweep it up with `docker volume prune`. |
| **The SQL warehouse** (`sql_warehouse_id` `777c012ee7ecf4b3`) | Pre-existing Serverless Starter Warehouse — **not created** by this deployment; the Admin Portal only reads it. |
| **`docker/.env`** | Git-ignored deployment state a human authored, with a tracked `*.example.*` template beside it. **Present this run** (it was absent on 2026-08-04); never delete it. |
| **`deploy/databricks/app.yaml`** | Same class: git-ignored deploy state with a tracked example template. |
| **`deploy/databricks/databricks_manifest.json`** | The cloud teardown authority. Destroying it strands every cloud resource it names. `tear_down.py` deletes it last, deliberately. |
| **`frontend/.env.development.local`** | Local config a human set (`NEXT_PUBLIC_API_BASE_URL`). Not generated. |
| **Orphaned `/Users/<sp-id>/` workspace homes** | Roots are platform-protected; the API cannot delete them. Not destroyable, so not a teardown target. |

**Retired this run:** the protection on *"uncommitted work in the two feature
worktrees"*. Both worktrees are gone and their branches are merged into `master` at
`b61b0f9`. The protection had no remaining object.

> **Port 8000 — the protection still has no object.** As at both previous runs, `docker
> ps -a` shows no production container and nothing is listening on 8000. The *convention*
> stands (dev-verify on 8010/8100, never bind 8000) in case it is restored, but there is
> nothing there for teardown to avoid today.

---

## 4. Reversibility (most → least recoverable)

1. **Generated files (§2.7)** — fully rebuildable from source with the listed commands.
   `bash.exe.stackdump` is the exception: it is crash debris nothing recreates, and
   nothing needs it.
2. **`omniview_e2e` database** — dropped and recreated by `e2e_bootstrap` on every run.
   Currently absent.
3. **Local `datavault` schema** — fully derived from the `omniview` source rows by
   `uv run python -m pipelines.expense_tracker.main`. A rebuild drops and recreates it by
   design.
4. **Local `omniview` DB / `omniview-pgdata` volume** — **only partly recoverable.**
   Schemas and source rows re-derive (`ensure_schemas` → `migrate` →
   `import_banks_dir ..\Data\Banks` → the pipeline), but the **1 local user account and
   its 2 sessions do not** — they exist in no file. `manage.py createsuperuser` is the
   manual route; `manage.py changepassword <user>` if the account survives.
5. **Cloud `datavault`** — derived. Rebuilt only by the in-app **Rebuild** button (which
   runs as the SP; never run dbt against Lakebase as yourself).
6. **Cloud `omniview` schema data** — **partially irrecoverable.** Source rows re-import
   from `Data/`; any cloud account, session or ERD layout does not.
   *Grace period:* `databricks postgres delete-project` **soft-deletes** —
   `databricks postgres undelete-project projects/omniview` restores the project, its
   `uid`, endpoint host and all data intact until `purge_time` (delete + 7 days). The
   slug stays reserved until then, so undelete is the *only* route back inside that
   window. After purge, both the data and the name are gone.
7. **Cloud `SECRET_KEY`** — regenerable but **not to the same value**; regenerating
   invalidates every existing session. It exists only in the secret scope.

**Nothing in this project is currently irrecoverable-by-any-means.** That is a change
from 2026-08-04, when uncommitted worktree changes held that rank. The least recoverable
things now are the local and cloud user accounts and the cloud `SECRET_KEY`.

---

## 5. Teardown ordering

Consumers before dependencies; disconnect before drop; derived before source; delegate
where purpose-built tooling exists.

1. **Re-authenticate before touching the cloud.** `databricks auth login --profile
   DatabricksFree`. The cloud state in §2.6 is unverified; do not run destructive cloud
   tooling against an unsurveyed workspace.
2. **Cloud — delegate.** `uv run python deploy/databricks/tear_down.py` (profile
   `DatabricksFree`). It removes, in order: the app (with its SP and resource bindings)
   → the workspace folder → the secret scope → the Lakebase project (soft-delete, 7-day
   purge). Do not hand-delete cloud resources.
3. **Local app before DB.** `docker compose -f docker/docker-compose.yml down` stops
   `omniview-app-1` before `omniview-db-1`.
4. **Local stateful objects.** Remove volume `omniview-pgdata` (this also removes the
   `omniview` database and any `omniview_e2e`) and network `omniview_default` —
   `down -v` does both. Never `docker volume prune`; it would take the protected
   anonymous volume with it.
5. **Local image.** Remove `omniview-app:latest`. Leave `postgres:17-alpine`.
6. **Generated files (§2.7).** Delete by exact path only. Do not delete
   `quality/reports/` wholesale — `baseline-audit.md` inside it is committed source.

No worktree step is required this run — there is only one working directory, and it is
the repository itself (§3).

Never included in any step: everything in §3.

---

This manifest is what the **`teardown`** skill consumes: invoking it destroys every
artifact listed above, restricts itself to exactly that list, takes no backups, and
finishes by deleting this file. Regenerating the manifest is routine maintenance and does
not imply a teardown should follow.
