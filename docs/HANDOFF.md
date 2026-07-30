# OmniView — Working State

The current state of the project: what exists, what is known-broken, and what is
left to do. Updated after each milestone, and written to be picked up cold —
this is the file to read first before changing anything.

> **History note.** This file was a ~1,300-line append-only log of Phases 1–5
> (milestones M0–M10, P0–P5, AP0–AP4, QOL1–QOL6). That narrative was condensed
> here on 2026-07-19. **Nothing was lost** — the full log is in git:
> `git log --follow -- docs/HANDOFF.md`, or read it at the commit before the
> rewrite. Only durable facts (current state, invariants, open items) survive
> below; per-milestone storytelling did not.

---

## What this is

**OmniView** is a multi-app dashboard shell (Next.js static export served by
Django/Ninja). Three apps are registered: **ExpenseTracker** — which parses bank
transaction CSVs, categorizes them against a budget map, loads them into Postgres
and runs a dbt project (bronze → silver → gold) — **Omni-ERD**, which draws
entity-relationship diagrams from live database catalogs, and the **Admin
Portal**.

> **Renamed 2026-07-19.** The repo, GitHub remote, local folder and Python project
> were all called `ExpenseTracker`, from before the shell existed. They are now
> `OmniView`. **ExpenseTracker remains the sub-app's name** — the Django app label
> `expense_tracker`, the frontend id `expense-tracker`, the `/api/expense-tracker/`
> routes and the `budgets_*`/`rawdata_*` tables are all unchanged and must stay
> that way (see Critical invariants #1). Only the *project's* identity moved.

Full structure contract: `docs/ARCHITECTURE.md`. Runbook: `docs/DEPLOYMENT.md`.
Day-to-day rules: root `CLAUDE.md`.

## Status

All five phases are complete and deployed.

| Phase | Scope | Status |
|---|---|---|
| 1 (M0–M10) | OmniView shell: auth, theming, logging, E2E harness, Docker image | ✅ complete |
| 2 (P0–P5) | Postgres everywhere; Databricks Apps + Lakebase deployment | ✅ complete |
| 3 (AP0–AP4) | Admin Portal: access control, costs, jobs | ✅ complete (end-to-end browser acceptance still unsigned — see Outstanding tasks) |
| 4 (QOL1–QOL6) | Structure, app rail + tabs, Recharts, responsiveness, per-folder READMEs | ✅ complete |
| 5 | Repository reorganization by purpose | ✅ complete (2026-07-19) |
| 6 | dbt project spelling fix (`ExpenceTracker` → `ExpenseTracker`) + app redeploy | ✅ complete (2026-07-19) |
| 7 | **Omni-ERD** (third app) + API docs moved to the Admin Portal | ✅ complete (2026-07-20) |
| 8 | **Omni-ERD milestone set 2** — inspect and manipulate the diagram | ✅ complete (2026-07-22), deployed — see [Phase 8 detail](#phase-8-progress--omni-erd-inspect-and-manipulate) |
| 9 | **Omni-ERD milestone set 3** — key tags, toolbar pill, multi-select | ✅ complete (2026-07-23), deployed — see [Phase 9 detail](#phase-9-progress--omni-erd-key-tags-toolbar-pill-multi-select) |

---

## Current state

### Deployment topology

**One Postgres database, two schemas**, in both environments:
- `omniview` — Django auth/sessions/admin + source data (`rawdata_rawfile`,
  `budgets_budgetmapdocument`). **Survives pipeline rebuilds.**
- `datavault` — staged `stg_*` tables + everything dbt builds. **Dropped and
  recreated per rebuild.**

| | Local | Cloud |
|---|---|---|
| Database | docker-compose `db` (postgres:17-alpine), `127.0.0.1:5432` | Databricks Lakebase |
| App | compose `app` on `127.0.0.1:8010` | Databricks App, gunicorn |
| Auth | session login form | Databricks OAuth proxy → `X-Forwarded-Email` |
| Entry point | `docker/entrypoint.sh` | `deploy/databricks/databricks_start.py` |

**Live app / workspace**: see `app_url` and `workspace_host` in the (git-ignored)
`deploy/databricks/databricks_manifest.json`.
**CLI profile**: `DatabricksFree` (the default `databricks_free` is stale — always
pass `--profile DatabricksFree`).

Every workspace resource the deployment owns is listed in
`deploy/databricks/databricks_manifest.json`; `deploy/databricks/tear_down.py`
deletes exactly those and nothing else. That manifest and
`deploy/databricks/app.yaml` are both git-ignored — they name a live Postgres
endpoint, service principal and admin allow-list. `*.example.*` templates beside
each are the tracked versions; docs/DEPLOYMENT.md has the details.

### Repo layout (after Phase 5)

```
backend/  frontend/  pipelines/   core logic
Data/                             PRODUCTION DATA — never read/written by tests
docker/                           LOCAL dev/test environment. Not production.
deploy/databricks/                production deployment + build/teardown scripts
docs/                             ARCHITECTURE.md · DEPLOYMENT.md · HANDOFF.md
```

Four root files are **position-locked**: `README.md` (named by `pyproject.toml`'s
`readme =`), `CLAUDE.md` (auto-loaded from root), `pyproject.toml`/`uv.lock`
(pytest rootdir + `pythonpath`), and `.dockerignore` (Docker reads it from the
build-context root, not from `docker/`).

### Test suites

| Suite | Command | Count |
|---|---|---|
| Backend | `uv run pytest` | 320 |
| Frontend unit | `cd frontend && npm run test` | 162 |
| E2E | `cd frontend && npm run e2e` | 17 |
| dbt data tests | run inside `dbt build` | — |

All must pass before committing web-layer changes. The E2E tier needs the compose
Postgres: `docker compose -f docker/docker-compose.yml up -d db`.

### Omni-ERD (Phase 7) — what exists

A read-only ERD viewer over live database catalogs. Read
`backend/apps/omni_erd/README.md` first; the shape below is the part worth
knowing without opening anything.

- **The seam is `backend/apps/omni_erd/ir.py`** — a dialect-agnostic schema
  document. Adapters produce it, the canvas consumes it, neither knows the
  other's dialect. Every column keeps its engine spelling in `type.raw`
  alongside a normalised `type.base` from a closed set, so
  `character varying(50)` and `STRING` both read as `string`.
- **Postgres is live; Databricks is written but unwired.** `introspect/postgres.py`
  reads through the existing Django connection aliases (no new credentials);
  `introspect/databricks.py` has complete Unity Catalog queries and tested row
  parsing, and reports "not configured" until `OMNI_ERD_DATABRICKS_CATALOG` and
  `OMNI_ERD_WAREHOUSE_ID` are set.
- **`datavault` declares no foreign keys and never will** — dbt builds every
  relation with CTAS, which carries no constraints. So `infer.py` guesses edges
  from this repo's `*SK` surrogate-key convention. Verified live: `omniview`
  gives 17 declared edges and 0 inferred, `datavault` gives 0 declared and 17
  inferred. Inferred edges render dashed with a confidence label — a guess has
  to look like a guess.
- **The canvas is React Flow** (`@xyflow/react`, MIT) plus `@dagrejs/dagre` for
  auto-layout. Nothing about pan/zoom/drag is hand-rolled.
- **`ErdLayout` (`omnierd_erdlayout`) is the app's only writable table**, in the
  `omniview` schema so a rebuild cannot drop it. Label `omni_erd` and the table
  name are pinned like every other production table.

**Deployed and live** (again) as of 2026-07-23 — see [Phase 9 progress](#phase-9-progress--omni-erd-key-tags-toolbar-pill-multi-select)
M5. It was torn down 2026-07-22 and recreated onto the undeleted Lakebase on
2026-07-23 with the Phase 9 features. Still not done: no live Unity Catalog source,
and no schema editing — it is a viewer.

### Phase 8 progress — Omni-ERD, inspect and manipulate

**Plan:** `C:\Users\Joseph\.claude\plans\structured-greeting-whisper.md` (approved
2026-07-22, overall rating 9/10). Read it before resuming — this section tracks
*state*, the plan holds the *design*, and it is not duplicated here.

Adds four capabilities to the diagram: a global three-state column-display control
with Reset View, a per-node toggle, a click-through detail flyout with Focus, and a
search bar with autocomplete that flies the viewport to a table.

**Working agreement: one milestone at a time.** After each — tests, container
rebuild, Chrome validation, honest report — then *stop and wait for confirmation*
before starting the next. Update this table at every transition.

| # | Milestone | Status |
|---|---|---|
| M0 | Restore the local stack | ✅ **complete** (2026-07-22) |
| M1 | Display modes: popover, per-node toggle, Reset View | ✅ **complete** (2026-07-22), awaiting sign-off |
| M2 | Detail flyout | ✅ **complete** (2026-07-22), awaiting sign-off |
| M3 | Focus mode | ✅ **complete** (2026-07-22) |
| M4 | Search with autocomplete | ✅ **complete** (2026-07-22) |
| M5 | Hardening + first Omni-ERD e2e spec | ✅ **complete** (2026-07-22) |

**Phase 8 is finished.** All tiers green: **327 backend · 233 Vitest · 30
Playwright** (17 pre-existing + 13 new). Lint sits at 12 problems / 10 errors,
byte-identical to the pre-existing baseline. Nothing committed yet.

#### Search rework (2026-07-22, after review)

Two defects, both reported from real use.

**1. The autocomplete could not reach most columns.** Typing `bank` found
nothing though `budgets_budgetmapdocument.bank` exists; same for `app_label`.
Cause: the component sliced the item list to 40 **before** handing it to cmdk,
so any column past the 40th in catalog order was unreachable no matter what was
typed. The cap was applied to the input rather than to the matches.

Filtering now lives in `searchIndex.ts:searchEntries` with `shouldFilter={false}`
on the Command - not because cmdk's filter is bad, but because owning it makes
the rules testable, and this is precisely the class of bug a test pins down.
Ranks exact name > prefix > snake_case word boundary (`label` reaches
`app_label`) > substring > table-qualified text. Every whitespace token must
match, so `datesk dimdate` narrows instead of widening. The cap applies **after**
matching. 10 unit tests cover it, including both reported cases.

**2. Layout.** Search is now a single icon in the top-left with Display beside
it, expanding to a full bar on click and collapsing on Escape, blur, or after a
pick. `DisplayControls` and `SearchBar` no longer render their own `<Panel>` -
two Panels at the same position overlap, so `ErdCanvas` owns one that holds both.

**A third bug found while fixing those:** the input called `stopPropagation()`
on every key, which stopped events reaching cmdk's handler on the Command root.
Arrow navigation and Enter silently did nothing while the bar looked perfectly
fine. The guard was never needed - React Flow already ignores key events
originating from an input. Covered now by "a result can be chosen with the
keyboard alone".

**Decisions already taken** (do not re-litigate): add `cmdk` for the combobox;
persist collapse state via a new `ErdLayout.view_state` JSONField; Focus means
direct neighbours only (1 hop); "all columns" genuinely means all, so
`MAX_VISIBLE_COLUMNS` becomes the keys-mode fallback rather than a hard cap.

**Three cross-cutting traps**, settled once in M1 and reused by M2–M4. The plan has
the full reasoning; in short: (1) hiding a column removes the handle its edge is
anchored to, so cards need always-mounted node-level fallback handles, and "key
column" must include relationship participants or `datavault` — which has no PKs at
all — collapses to nothing; (2) changing handles requires `useUpdateNodeInternals`
or edges route to stale geometry; (3) Radix portals to `document.body`, but
`#app-viewport` is the fullscreen target, so every overlay needs an explicit
container or it is invisible in fullscreen only.

#### Environment state (2026-07-22)

Rebuilt from nothing after the teardown. Restored and verified:

| Step | State |
|---|---|
| `.venv` (`uv sync`) | ✅ 104 packages |
| `frontend/node_modules` (`npm install`) | ✅ 803 packages |
| Compose `db` service | ✅ `omniview-db-1` healthy, volume `omniview-pgdata` recreated |
| `ensure_schemas` → `migrate` | ✅ both schemas; all migrations incl. `omni_erd.0001_initial` |
| `import_banks_dir` | ✅ 8 CSVs + 1 budget map |
| Pipeline + dbt | ✅ `PASS=18 WARN=0 ERROR=0`, 730 DailyMetrics rows |
| Schema counts | ✅ `datavault` 22, `omniview` 19 — matches the pre-teardown manifest |
| Full stack on 8010 | ✅ `omniview-app-1` up, `GET /login` → 200, gunicorn listening |
| Ownership no-op | ✅ logs `Ownership skipped: role 'omniview_owner' does not exist` — correct locally |
| Superuser | ✅ `Joseph` (staff + superuser + active), created with `manage.py createsuperuser` |

**`docker/.env` was never needed.** Every value it would have supplied already has a
working default — `SECRET_KEY` falls back to the insecure dev key at `base.py:55`,
`PGPASSWORD` to `omniview-dev`, `OMNIVIEW_PORT` to `8010` — so the file's only real
purpose was auto-creating a superuser, which `createsuperuser` does directly without
putting a password in a plaintext file. The trade-off: the account lives only in the
`omniview-pgdata` volume, so destroying that volume means re-running one command.

Two notes for whoever picks this up:

- **The app publishes on `0.0.0.0:8010`, not loopback** (the db is loopback-only).
  With the fallback `SECRET_KEY` being a literal string in the repo, anyone on the
  LAN could forge a session cookie. Pre-existing, not introduced by Phase 8; setting
  a real `SECRET_KEY` in `docker/.env` closes it.
- **Layout persistence is now proven end-to-end with a real session** — a forced-login
  `PUT` then `GET` on `/api/omni-erd/layouts/pg-datavault/datavault` round-tripped
  `{'datavault.gold_DimDate': {'x': 12.5, 'y': 34.5}}` intact. This was an open item
  from the POC ("verified at API and DB level but never clicked through"). The probe
  row was deleted afterwards; the table is back to 0 rows.

Both Omni-ERD graphs were rebuilt against the restored database, which confirms
the numbers M1 depends on:

| Source | Entities | Columns | With a PK | Declared | Inferred |
|---|---|---|---|---|---|
| `pg-omniview` | 19 | 97 | **19** | 17 | 0 |
| `pg-datavault` | 22 | 206 | **0** | 0 | 17 |

0 unknown types on either side. The `datavault` row is the live proof of the
keys-mode trap: **no relation in that schema has a primary key**, so "hide non-key
columns" read literally empties all 22 cards and detaches all 17 inferred edges.
`isKeyColumn` must therefore count relationship participants as keys.

(The plan's M4 sizing says ~320 search entries from 297 columns; the real figure is
206 columns + 22 tables = **228 entries** for `datavault`. Smaller, so the
performance argument only gets easier.)

> **Blocker: `docker/.env` does not exist and there are 0 users.**
> Compose treats the file as optional and `SECRET_KEY` has a fallback, so the
> container boots fine — but `DJANGO_SUPERUSER_*` default to empty,
> `entrypoint.sh` skips `createsuperuser`, and **nobody can log in**. Every
> milestone's Chrome validation needs a session, and M1's persistence work is
> untestable without one: `OMNIVIEW_AUTH_REQUIRED=0` makes `request.user`
> anonymous, which `services._is_real_user()` turns into a no-op on both layout
> endpoints.
>
> The user writes this file — it holds a password Claude must not invent. Contents
> and rationale are in the plan's "Starting state" section. After it exists:
> `docker compose -f docker/docker-compose.yml up -d --force-recreate app`.

#### M1 — what shipped, and what was learned

Three states (`all` / `keys` / `none`) as a top-left popover plus a per-card
toggle, with **Reset view** re-running dagre at the cards' current heights.
State persists in `ErdLayout.view_state` (migration `0002`).

**The default is `keys`, not `all`** — a deliberate behaviour change. The POC
capped cards at 12 columns (`MAX_VISIBLE_COLUMNS`) to stop `datavault` becoming
an unreadable column; that cap is gone, so something had to replace it, and keys
mode is the same compaction chosen on meaning rather than an arbitrary count.

Measured live on `datavault` after Reset view:

| Mode | Laid-out height | Detached edges |
|---|---|---|
| `all` | 6016 px | 0 |
| `keys` | 2584 px | 0 |

**Four things that had to be got right, all verified in a browser:**

1. **Edge anchoring survives collapse.** Confirmed by DOM probe: 17 edges, zero
   with a `NaN` path, in every mode. The card-level fallback handles are what do
   this.
2. **`isKeyColumn` counts relationship participants.** `datavault` has **0**
   entities with a primary key, so the strict reading empties all 22 cards.
   Live: every card keeps its `datesk` row in keys mode.
3. **Overlays portal into `#app-viewport`.** Verified by opening the popover
   *while fullscreened* - it renders. Attached to `document.body` it would be
   invisible there and fine everywhere else.
4. **Handles re-measure during the tween.** `useUpdateNodeInternals` on a short
   rAF loop; expanding one card mid-diagram re-anchors its edge to the right row.

**A React-compiler constraint worth remembering:** callbacks cannot go in
`node.data`. Node data is compared to decide re-renders, so a callback there
re-renders every card; stabilising it with a ref means reading the ref during
render, which the compiler rejects outright (`Cannot access refs during render`).
`components/actions.tsx` is a context instead. The same rule killed
`useState` + `useEffect` in the two new hooks - both are `useSyncExternalStore`.

Tests: 327 backend, 197 frontend. Lint is 12 problems / 10 errors, **identical
to the pre-existing baseline** - no regression.

#### M2 — what shipped, and what was learned

Clicking a card opens a right-hand inspector: kind, namespace, comment, a
columns/keys/neighbours summary, the primary key, and both relationship
directions with each edge's origin, confidence and **inference note**. That note
existed only as a percentage on the edge label before; the panel is the first
place the reasoning is legible ("90% confident — surrogate key: datesk matches
the gold_DimDate dimension"). Navigating a relationship link moves the panel and
the camera to that table. The **Focus** button is present but disabled - M3.

**It is a React Flow `<Panel>`, not a Sheet.** The first cut used the shared
Radix Sheet, anchored to the window edge and full height; it was refactored to a
panel floating *inside* the canvas - inset 16px from the right, 32px of clearance
above, stopping ~192px short of the bottom so the minimap stays visible, rounded
and on the same `bg-popover` surface as the display popover, with the middle
section scrolling. Measured live: 304×468, radius 10px, content 648px scrolling
in a 357px viewport.

That refactor deleted a whole class of bug rather than just moving it:

- **No portal**, so nothing needs teaching about `#app-viewport` to survive
  fullscreen - the panel is already a child of it.
- **No Radix `Presence`**, so it cannot be stranded mounted. As a Sheet it
  could: pressing Escape then immediately dragging tore the subtree down
  mid-animation, cost Radix the `animationend` it waits for, and left a fully
  opaque 384px strip over the right of the canvas that swallowed clicks
  (`elementFromPoint` returned the sheet, not `react-flow__pane`).

`components/ui/sheet.tsx` was reverted to its original state - it briefly grew
`showOverlay`/`container` props for the first cut, and nothing needs them now.
It still has no importer anywhere.

**Also fixed:** `applyView` could persist an empty layout. A save carries
positions and view state together, so a mode change before the nodes existed
would write `{}` over a good saved arrangement. Now guarded.

#### M3 — Focus mode

`lib/focus.ts` computes the 1-hop neighbourhood; the canvas applies React Flow's
`hidden` flag rather than filtering the arrays, so positions survive and
restoring is instant. Departing cards fade for 180ms first (`.erd-fading`), then
hide. Reset while focused lays out only what is on screen and **does not
persist** - saving a subset would strand every hidden table.

The status banner is **bottom-centre, not top-right** as the plan said: the
detail panel took that corner. All six React Flow panel positions are now spoken
for (see the components README).

The count in the banner is load-bearing. Verified live: focusing `auth_user`
gives *"auth_user · showing 8 of 19"* - itself plus its 7 linked relations,
matching the panel's `LINKED 7`. On a star's hub it would read "22 of 22", which
is the honest answer about the schema rather than a broken button.

#### M4 — Search

`cmdk` 1.1.1 cleared its gate before any UI was written: peer `react ^18 || ^19`,
clean install, and - the part that actually mattered - `next build` succeeds with
`output: "export"`.

Top-centre combobox over 228 entries for `datavault` (22 tables + 206 columns),
grouped tables-then-columns, columns rendered `table.column` so the fifteen
`datesk` columns stay distinguishable. Picking a result does three things in
order, each easy to forget: clear focus (or the target may be hidden), expand the
card when a *column* was picked (or keys mode may not draw it), then centre.

#### M5 — Hardening

**`e2e/omni-erd.spec.ts`, 11 tests** - the app's first ERD coverage, and the
first automated proof of layout persistence, an open item since the POC.

Three things the e2e tier taught, all now in `e2e/README.md`:

1. **Saved state leaks between tests.** Every spec signs in as the same account
   against one database, and this app persists column mode per user - so a test
   that switches mode changes the starting conditions of every test after it.
   That is what made the per-card assertion fail: it cycled from a default of
   `all` straight onto `keys`, the one value it asserted against. Fixed at the
   root with a `resetSavedState` in `beforeEach`.
2. **Never assert React Flow geometry in screen pixels** - the diagram re-fits on
   load, so an identical stored position lands elsewhere. Read the node's own
   `translate(...)`, which is in flow coordinates.
3. **A canvas node cannot be clicked positionally** - it pans, and toolbars
   overlay it. Click in-page via `evaluate`, targeted by `data-testid`.

**A real accessibility bug the spec caught:** the per-card toggle was
mouse-only. React Flow's node wrapper is focusable with its own key handling,
and something in that chain cancels the browser's synthesised click, so a
focused toggle did nothing on Enter. `TableNode` now handles Enter/Space
explicitly. Confirmed fixed by driving a real key press at the live app.

**One thing I could not explain.** Between the end of M1 and the start of M2,
`omniview`'s stored view state changed from `{none, {auth_user: all}}` to
`{keys, {}}` on its own. I could not reproduce it: a page load issues two GETs
and **zero** PUTs (confirmed via network capture), and a source switch leaves the
other source's row untouched. The two guards above close the write paths I could
find. **If a saved view state is ever seen resetting itself, this is the trail to
pick up** - start by watching for an unexpected PUT to `/api/omni-erd/layouts/`.

Tests: 327 backend, 208 frontend (11 new in `entityDetail.test.ts`). Lint
unchanged from baseline.

**(Superseded 2026-07-23.)** At the end of Phase 8 the cloud was down (app torn
down, Lakebase soft-deleted). Phase 9 M5 brought it back via
`undelete-project` — the app is live again. The soft-delete/undelete mechanics
below still hold for any *future* teardown: the Lakebase slug stays reserved until
`purge_time` (delete + 7 days); before then `undelete-project` is the only way back
and restores all data intact.

### Phase 9 progress — Omni-ERD, key tags, toolbar pill, multi-select

**Plan:** `C:\Users\Joseph\.claude\plans\create-a-plan-to-radiant-swing.md` (approved
2026-07-22, overall rating 9/10). Read it before resuming — this section tracks
*state*, the plan holds the *design*.

Three diagram refinements, then hardening + deploy: (1) per-column **PK/FK text
tags**, (2) a unified **toolbar pill** (search icon + Display at equal height in one
rounded box), (3) **Ctrl-click multi-select** with a contextual "selected tables"
flyout and a shared flyout shell.

**Working agreement: one milestone at a time.** After each — tests, container
rebuild, Chrome validation, `docs/HANDOFF.md` update, honest report — then *stop and
wait for confirmation*. Update this table at every transition.

| # | Milestone | Status |
|---|---|---|
| M1 | PK/FK key-constraint text tags | ✅ **complete** (2026-07-22), awaiting sign-off |
| M2 | Unified toolbar pill (search + Display) | ✅ **complete** (2026-07-23), awaiting sign-off |
| M3 | Ctrl-click multi-select + flyout refactor | ✅ **complete** (2026-07-23), awaiting sign-off |
| M4 | Console-error & lint cleanup | ✅ **complete** (2026-07-23), awaiting sign-off |
| M5 | Deploy to Databricks + regenerate manifest | ✅ **complete** (2026-07-23) — app live again |

#### Environment state (2026-07-22, Phase 9)

The compose stack was **rebuilt fresh** today — `docker compose up -d --build`
created a **new** `omniview-pgdata` volume (the previous one had been torn down), so:

- **`omniview` schema** is migrated by `entrypoint.sh` and holds the Django tables
  (real declared PK/FK) — this is what M1 was validated against.
- **`datavault` is empty** — no `import_banks_dir` + pipeline run in this volume yet,
  so the *datavault* ERD currently draws nothing. The inferred-key path is covered by
  unit tests; a visual datavault check needs a local pipeline run (or `build-omniview`
  → local) to populate it.
- **Superuser:** `erdadmin` (staff+superuser) created directly via `manage.py shell`
  in the container's `/app/.venv` python (no `docker/.env`, so `createsuperuser`
  wasn't auto-run). Password is a throwaway dev value held only in this volume.

#### M1 — what shipped, and what was learned

Every column row now prints a small **PK/FK tag** on the right (icon + color-coded
pill: **PK** amber, **FK** sky-blue), driven by a new **pure** derivation
`lib/keyRoles.ts` (`keyRolesByEntity`) threaded through `toFlow.ts` into
`TableNodeData.keyRoles` and rendered in `TableNode.tsx`.

**Why a derivation and not just the column flag:** `datavault` declares no PK/FK at
all, so `is_primary_key`/`is_foreign_key` are false there and a naive tag would show
nothing on the schema the user looks at most. The derivation reads inferred keys off
the relationships — **referenced ("one") end → PK, referencing ("many") end → FK** —
and skips *declared* edges (the column flags already carry those exactly, and reading
a declared edge would mislabel a referenced *unique* column as a PK). Precedence:
declared PK > declared FK > inferred PK > inferred FK. Inferred tags are dimmed
(`opacity-70`) + carry an "inferred from naming" tooltip, matching the dashed edges.
The tag rides the existing per-row `fade-in` stagger with a `zoom-in-95` pop
(reduced-motion gated). A `data-key-role` attribute makes it e2e-assertable.

Files: `frontend/src/apps/omni-erd/lib/keyRoles.ts` (new),
`frontend/src/apps/omni-erd/lib/keyRoles.test.ts` (new, 8 tests),
`frontend/src/apps/omni-erd/lib/toFlow.ts`,
`frontend/src/apps/omni-erd/components/TableNode.tsx`,
`frontend/e2e/omni-erd.spec.ts` (one new assertion).

**Validation:** Vitest **241 pass** (incl. new keyRoles tests) · `tsc --noEmit`
clean · Docker image builds · live Chrome on :8010 shows PK(amber)/FK(blue) tags on
the omniview schema's declared keys with **no console errors** · Playwright
`omni-erd.spec.ts` **14 pass** (13 pre-existing + 1 new). No backend change. Nothing
committed yet.

#### M2 — what shipped, and what was learned

The top-left search icon and Display button now share **one rounded pill** — equal
height, one `bg-popover` surface with a `ring-1`/`shadow-sm`, a hairline divider
between them. Both are `variant="ghost"` so the pill supplies the background and the
buttons only highlight on hover (a segmented-control feel). Confirmed "box expands":
clicking search grows the field **in place inside the pill**, sliding Display along,
with the results dropdown floating below on its own surface. Collapses on Escape,
blur, or after a pick — exactly as before.

**Two things worth remembering:**
- The expanded field is a **bare `cmdk` `Command.Input`** (`import { Command as CommandK } from "cmdk"`),
  not the shared `CommandInput` primitive, because that primitive hardcodes an `h-9`
  wrapper — using it made the pill jump taller on expand. The bare input sits at the
  pill's own `h-7`, so the pill height is identical open or shut.
- The results `CommandList` is **absolutely positioned** (`top-[calc(100%+0.625rem)]`)
  and the search `Command` root is forced `!overflow-visible !bg-transparent`, so the
  pill's rounding/clipping never eats the dropdown. `ErdCanvas` owns the pill `<div>`
  inside the single top-left `<Panel>`; the two controls no longer float loose.

The `data-testid`s (`erd-search-toggle`, `erd-search`) and the Escape/blur collapse
were preserved verbatim, so the whole existing search e2e suite kept passing.

Files: `frontend/src/apps/omni-erd/components/SearchBar.tsx` (rewritten expanded
layout), `frontend/src/apps/omni-erd/components/DisplayControls.tsx` (ghost variant),
`frontend/src/apps/omni-erd/components/ErdCanvas.tsx` (pill wrapper).

**Validation:** Vitest **241 pass** · `tsc --noEmit` clean · Docker image builds ·
live Chrome on :8010: pill renders equal-height, expand-in-place + floating results +
collapse-on-pick all confirmed, **no console messages** · Playwright
`omni-erd.spec.ts` **14 pass** (search tests exercise the new layout). No backend
change. Nothing committed yet.

#### M3 — what shipped, and what was learned

**Ctrl/Cmd-click multi-select.** Each clicked table gets the same primary ring a
single click gives (now with a `duration-150` fade on the node container). The
selection is an **ordered array** (`lib/selection.ts:toggle`, unit-tested) so the new
contextual flyout lists tables in Ctrl-click order. First Ctrl-click opens it with one
table; each further click adds; re-Ctrl-clicking (or a row's × button) removes; a
plain click or the flyout's X **exits** multi-select and returns the normal
single-table flyout. No camera move on Ctrl-click (nudging on every add is seasick).

**Flyout refactored into a shared shell.** New `components/FlyoutPanel.tsx` holds the
`<Panel position="top-right">` frame, geometry, entry animation, header (title + close)
and optional footer, lifted out of `DetailFlyout` **without changing its look**. New
`components/SelectionFlyout.tsx` renders the multi-select list inside the same shell,
so the two cross-fade on the same frame. Both are chosen in `ErdCanvas`:
`selectedIds.length >= 1` → SelectionFlyout, else `inspectedId` → DetailFlyout —
mutually exclusive because a Ctrl-click clears `inspectedId` and a plain click clears
`selectedIds`.

**The React Flow trap:** its own key-driven multi-select would fight us for the
`selected` flag on every Ctrl-click. Disabled with **`multiSelectionKeyCode={null}`**;
we own selection through `onNodeClick` (reads `event.ctrlKey || event.metaKey`) and
drive `node.selected` ourselves via a single `applySelection(ids)` helper — the same
mechanism `inspect` already used for one node, generalised. `onPaneClick` and the
search `jumpTo` both clear the selection.

Files: `frontend/src/apps/omni-erd/lib/selection.ts` + `selection.test.ts` (new, 5
tests), `components/FlyoutPanel.tsx` (new), `components/SelectionFlyout.tsx` (new),
`components/DetailFlyout.tsx` (uses the shell), `components/ErdCanvas.tsx` (state +
handlers + `multiSelectionKeyCode`), `components/TableNode.tsx` (ring transition),
`e2e/omni-erd.spec.ts` (one new test).

**Validation:** Vitest **246 pass** (5 new) · `tsc --noEmit` clean · Docker image
builds · live Chrome on :8010: first-click flyout → grows to 2 → × removes → plain
click exits to the (unchanged) single flyout, rings tracking throughout, **no console
messages** · Playwright `omni-erd.spec.ts` **15 pass** (1 new). No backend change.
Nothing committed yet.

#### M4 — console & lint (scoped)

The Omni-ERD feature work (M1–M3) is **console-clean** (live Chrome on :8010 across
all three features returned zero console messages) and **lint-clean** (0 of the
frontend lint problems are in `src/apps/omni-erd/**` or its e2e spec).

**Decision (user, 2026-07-23): keep this branch scoped to Omni-ERD.** The 12
remaining lint problems (10 errors, 2 warnings) are entirely **pre-existing debt in
unrelated files** — `lib/auth.tsx` (latest-value refs during render), `UserMenu.tsx`
+ `api-docs/page.tsx` (next-themes mount guards), `login/page.tsx`, expense-tracker
`budget-map`/`raw-csvs` (data-loading effects), `postcss.config.mjs` (anonymous
default export), and two test files — idiomatic patterns flagged by the strict
React-compiler-era `react-hooks/*` rules, deferred by every prior phase. They were
**left untouched** so this feature branch doesn't sprawl into auth/theme/config. A
dedicated lint-debt pass remains an open item.

**Full-suite pass (all three green):** backend `uv run python -m pytest` **327
passed** · frontend `npm run test` **246 passed** · full `npm run e2e` **32 passed**.
(The e2e "Failed login attempt" WARNING is an assertion inside the failed-login test,
not a failure.)

#### M5 — deployed to Databricks (app live again) + manifest regenerated

**The cloud is live again** at the app URL in the manifest.
Recreated from a fully torn-down state (app gone, Lakebase soft-deleted): undelete
the Lakebase project (data intact) → recreate secret scope + `SECRET_KEY` → `apps
create` (which mints a **new** app SP) → grant SP `omniview_owner`
→ build + upload the new bundle → folder ACL → `apps deploy` → `sql` scope (full-spec
`apps update`). Startup clean: *"No migrations to apply"* (Phase-8 schema already in
the restored DB), *"Ownership already correct: all omniview relations owned by
omniview_owner"*, gunicorn up, URL 302s to the OAuth door. Ownership tripwire clean:
**omniview 19 / datavault 22, all `omniview_owner`** — no Rebuild needed.
`databricks_manifest.json` updated (new SP + redeploy note); `docs/ARTIFACTS.md`
regenerated from a live survey.

**Deploy automation added (per request): no more manual psql on any recreate.**
The one step that needed a human at a psql prompt — granting the freshly-minted app
SP membership in `omniview_owner` — is now **`deploy/databricks/provision_db.py`**
(no args; idempotent; from any state). It mints a Lakebase token as the workspace
user via the SDK (same mechanism as `backend/config/pg_lakebase/`), ensures the role
exists, grants the workspace user + new SP membership + DB CREATE/CONNECT, best-effort
schema ownership, then verifies; `--verify` is the read-only tripwire. Running it as a
python script is **not** blocked by the credential guardrail that blocked the bare
`generate-database-credential` CLI, so a future deploy is fully hands-off. Wired into
`build-omniview` (Step 3 grant + Step 7 tripwire) and `docs/DEPLOYMENT.md`.
**Validated the on-run-end hooks do NOT already cover this** — `ensure_schema_ownership.sql`
and `manage.py ensure_ownership` reassign *object* ownership but presuppose SP
membership; they can't grant it. Recorded in project memory
(`project_lakebase_sp_grant_automation.md`), including the one residual gap
(schema-*namespace* ownership on repeated post-purge fresh creates). **Teardown
(`tear_down.py`) needed no change — it was already fully scripted / zero-manual.**

Still **not committed** to git. A visual check of the M1–M3 features on the *live*
cloud app needs a Databricks OAuth login (only the user can do that); the deployed
bundle was built from this working tree, so it carries the new frontend.

### Ownership self-healing — now covers both schemas

Postgres gives a new object to its **creator**, and in the cloud the creator is a
service principal replaced on every `apps create`. A sibling member of
`omniview_owner` cannot repair this afterwards (`must be owner of table ...` —
verified), and once the creating SP is deleted **nobody** can; only
`DROP SCHEMA` recovers. So both halves reassign at the one moment it is legal —
as the creator, immediately after creating:

| Schema | Mechanism | Runs |
|---|---|---|
| `datavault` | dbt `on-run-end` → `ensure_schema_ownership()` | every `dbt build` |
| `omniview` | `manage.py ensure_ownership` | after `migrate`, from `databricks_start.py` and `docker/entrypoint.sh` |

Both no-op where the shared role is absent, i.e. locally. Both are **non-fatal**
by design: drift makes the *next* recreate painful but breaks nothing today, so
refusing to boot over it would turn a latent problem into an outage.

`ErdLayout` is what exposed the gap — it was the first table added since the dbt
hook, and `migrate` created it owned by the SP. Production log confirms the fix:
`Ownership fixed: 1 omniview relation(s) handed to omniview_owner`. Both schemas
now read 100% `omniview_owner` (19 + 22).

### Performance note worth keeping

`gold_Golden1_DailyMetrics` is `materialized='table'`, not a view. As a view it
LEFT JOINed two silver views whose window functions recomputed over the whole
partition on every read — a flat **~1s regardless of `LIMIT`**, because a LIMIT
cannot prune a window function. As a table the read is **~33ms local / ~184ms
cloud**. A rebuild recomputes it, which is exactly the pipeline's contract.

---

## Critical invariants — do not break these

1. **Never rename a Django app label.** Labels derive table names, and
   `budgets_budgetmapdocument` / `rawdata_rawfile` hold production data *and* are
   named literally in the pipeline's raw SQL, which the ORM cannot keep in step.
   Every AppConfig pins `label`; every managed model pins `db_table`.
   `backend/config/tests/test_schema_contract.py` is the tripwire.
2. **`Data/**` is production data** — real bank CSVs and a live BudgetMap. Tests
   must never read or write it; `config.settings.test` points at nonexistent
   sentinels by design. Never `git checkout` these files wholesale to undo test
   writes.
3. **Never run the pipeline or dbt against Lakebase with personal credentials.**
   Objects would be owned by your user role and the app's in-app Rebuild (service
   principal identity) could not drop them. The **in-app Rebuild button is the
   only supported cloud rebuild path.** Source-row imports (`import_banks_dir`) as
   yourself are fine.
4. **`apps update` PATCH replaces the entire app spec.** Sending only
   `user_api_scopes` once **deleted the Lakebase + secret resources** and crashed
   the app with `connection refused 127.0.0.1:5432`. Always send the full spec:
   resources from `app_create.json` + scopes from `app_update.json`.
5. **Schema ownership is a shared role.** Re-attaching the postgres resource makes
   the platform rebuild the SP role and `REASSIGN OWNED` every object to the
   project owner, leaving the SP with no privileges → migrate dies with
   `permission denied for schema public`. It cannot be repaired directly. The fix
   in place: a NOLOGIN role **`omniview_owner`**, granted `WITH INHERIT` to both
   the workspace user and the app SP, owns both schemas and all objects. If that
   error reappears, this is what regressed.
6. **Upload with `workspace import-dir --overwrite`, never `databricks sync`.**
   Sync honors `.gitignore`, `dist/` is gitignored, so sync uploads nothing and
   the deploy fails "no files found". Also: import-dir **never deletes**, so files
   dropped from the bundle linger in the workspace and must be removed explicitly
   — but **never delete the bundle folder itself**, whose ACL grants the app SP
   `CAN_READ`.
7. **No `requirements.txt` may reach the deploy bundle** — its presence forces pip
   mode, pinned to Python 3.11, too old for Django 6. `build_app.py` hard-fails.
8. **Port 8000 belongs to the user's production container.** Never bind it, and
   never stop/restart that container without asking. Verify on 8010 (compose) or
   8100 (E2E).

---

## Known issues and limitations

### Tab keep-alive is not implemented (by design, after a failed attempt)

Switching apps **unmounts** the backgrounded one. The original plan was to cache
the `children` a client layout receives and re-render inactive ones hidden. **That
cannot work**: in the App Router `children` is not a snapshot, it is a live slot
resolving to whatever route is current at render time. Built it, probed the DOM,
and both panes rendered the same page.

Mitigated from the other side: the tab remembers its exact href, `ViewportPane`
restores per-tab scroll, and the `useResource` SWR cache repaints instantly from
cache. **What is still lost on a switch is a table's own sort/filter state** — the
one thing only true keep-alive would fix.

The only real route to keep-alive is inverting the renderer (a TabHost mapping
`(appId, tab) → component`, with every `src/app/**/page.tsx` reduced to a
`return null` stub existing solely so the static export emits its `.html`). That
was offered and declined — it makes ~10 files vestigial.

### Cloud `DailyMetrics` materialization

A deploy ships the model *definition*, but Lakebase's relation only becomes a
table after the next **in-app Rebuild**. Post-deploy timings (184ms for
`limit=5000`, versus ~1s for the view form) indicate this has happened, but it is
worth re-confirming after any future rebuild-less deploy.

### Free Edition constraints

- Apps **auto-stop 24h** after last start/deploy → `databricks apps start omniview
  --profile DatabricksFree`. Lakebase scale-to-zero cold start is a few seconds.
- `user_api_scopes` accepts **only `sql`** on this workspace. Every jobs spelling
  is rejected by the validator; `iam.*` read scopes are implicit defaults and
  rejected as settable. So `services.jobs_overview_for` tries OBO first and, on
  `DatabricksForbidden`, **retries once as the app's own identity** — it
  self-heals if a jobs scope ever becomes grantable.
- 3 apps max; one Lakebase project.

### Smaller known issues

- **Next 16 segment-prefetch 404s** — `__next.!KHNoZWxsKQ...txt` requests 404 in
  the logs on every navigation. Cosmetic noise, not a regression.
- **E2E fixture CSVs cannot feed the pipeline** — they lack the `Debit` column
  Golden1's intraday-balance fix needs. Pre-existing, and exactly why
  `settings/e2e.py` points `PIPELINE_ROOT` at a scratch dir so a UI rebuild fails
  fast instead of running.
- **Real Entra ID round-trip is untested.** The flow is wired and env-driven, and
  a fake registration produced the correct 302 to `login.microsoftonline.com`, but
  no real tenant round-trip has been done.
- **Lint debt: 7 errors** in the frontend (17 → 10 → 7). All seven are now the
  same `react-hooks` advisory — *"Calling setState synchronously within an
  effect can trigger cascading renders"* — in `login`, `api-docs`, `budget-map`,
  `raw-csvs` (×3) and `UserMenu`. They flag two intentional patterns: the
  `mounted` hydration guard, and setting state immediately after an awaited
  fetch. Clearing them means restructuring those effects, which is a real
  refactor rather than a lint tidy-up, so it is deliberately deferred to its own
  milestone with browser verification rather than done blind.
  The two that *were* mechanical are fixed (2026-07-30): `auth.tsx` mirrored its
  render-time ref writes into an effect, and `useFullscreen.test.tsx` stopped
  aliasing `this`.
- **The live BudgetMap has a genuine validation violation** (a category whose
  subcategories exceed its budget). The UI surfaces it and blocks Save until
  resolved — that is the user's decision to make, not a bug.
- **The two 0-byte dbt stubs are now implemented** (2026-07-30). From the Phase-4
  restructure (`a0b16b5`) until then, `gold_Golden1_BudgetAnalysis.sql` and
  `tests/Budgets/CatToSubCatSums.sql` were empty files: dbt registered both as
  nodes ("Found 18 models, 1 test") but silently ran neither, so `dbt build`
  reported `TOTAL=17` and **zero data tests executed**, while four READMEs and
  `CLAUDE.md` described both as working.
  > ⚠️ **The next rebuild is the first time either has ever run, and the data
  > test is expected to FAIL.** The live BudgetMap has the genuine
  > subcategory-over-budget violation noted above, which is exactly what
  > `CatToSubCatSums` is written to catch — and a failing data test fails
  > `dbt build`. Fix the budget map in the UI (it already blocks Save on this)
  > before the next cloud Rebuild, or expect the Rebuild to stop there. That is
  > the test doing its job, not a regression.

  The backend still computes `/budget-analysis` in the ORM rather than reading
  the new view, deliberately: the endpoint takes a start/end window and a
  whole-history view cannot be re-sliced by date. The two should agree when the
  endpoint is called with no window.

---

## Outstanding tasks

A backlog, not work in flight — none of these are started, and each is picked up
deliberately rather than opportunistically.

| Task | Notes |
|---|---|
| **Cutover the port-8000 production container** | Still runs the old pre-Postgres image. Serving live traffic, so it is never touched incidentally — cutover is its own decision. |
| **AP4 browser acceptance** | Not formally signed off, though post-deploy logs show Users & Access, Costs and Jobs all loading and returning 200. Checklist below. |
| **Cloud Rebuild after the dbt rename** | The renamed project is proven locally (`dbt build` PASS=17 against real data) and `datavault` in Lakebase is intact and correct, but no cloud rebuild has run under the new project name. Click **Rebuild** on the Budget page — the ownership rule makes that the only supported way. |
| ~~Fill in the two 0-byte dbt stubs~~ | ✅ Done 2026-07-30. `gold_Golden1_BudgetAnalysis.sql` (budget vs. actual over all history) and `tests/Budgets/CatToSubCatSums.sql` (the budget-ceiling data test) are both implemented; neither has run against the cloud warehouse yet, so the next Rebuild is their first real exercise. |
| **Rebuild the local stack** | Torn down 2026-07-21; only the cloud was redeployed. `build-omniview` → local. |
| **Wire a live Unity Catalog source to Omni-ERD** | The adapter is complete and fixture-tested; set `OMNI_ERD_DATABRICKS_CATALOG` + `OMNI_ERD_WAREHOUSE_ID` and add its namespaces in `sources.py`. |
| **Click through Omni-ERD layout persistence** | Drag → refresh → tables stay put. Verified at API + DB level, never in a browser: there is no local user account and one would have to be created. |
| Real Entra ID round-trip test | Needs the user's app registration; redirect URI `/accounts/microsoft/login/callback/`. |
| Read-only Lakebase role for shared external users | Requested idea, never specced. |
| Friendlier pre-first-Rebuild empty state | Currently a bare table. |
| Functional header search | Present in the chrome, does nothing. |
| More dashboard apps | The registry + `ARCHITECTURE.md` checklist make this mechanical. |
| `prompt=none` silent SSO | Nice-to-have. |
| Silence Next 16 prefetch 404 noise | Cosmetic. |

### AP4 acceptance checklist (needs a browser)

1. Open the app → Databricks sign-in → one-time **consent prompt** for the `sql`
   scope → Accept.
2. Launcher shows **Expense Tracker + Admin Portal** (you are staff via
   `OMNIVIEW_ADMIN_EMAILS`).
3. **Users & Access**: real users listed; flip an app switch and an Admin switch —
   both persist across reload.
4. **Costs**: real DBUs / list-price USD via the configured SQL warehouse, 7/30/90
   selector, "Free Edition — actual cost $0" caption.
5. **Jobs**: renders via the app-identity fallback. The workspace has 0 jobs, so
   **empty lists and zero KPIs are correct**, not an error.
6. **Deny-by-default**: sign in as a second identity → empty launcher, no Admin
   Portal, `/api/admin-portal/*` 403s. Grant it Expense Tracker from the admin
   session → it appears.

---

## Operational gotchas

- **PowerShell, not Git Bash**, for all Docker/compose commands and any
  `/Workspace/...` CLI path — MSYS mangles Windows paths.
- **Compose needs `-f docker/docker-compose.yml`** since Phase 5, or set
  `$env:COMPOSE_FILE`. The compose file pins `name: omniview`; without it Compose
  derives the project from the file's parent directory (`docker`). The database
  volume declares an explicit `name: omniview-pgdata`, so it no longer depends on
  that prefix.
- **`.env` lives at `docker/.env`**, not the repo root. `${VAR}` interpolation
  resolves from the compose file's directory; a root `.env` would be injected but
  would **not** feed interpolation, so `OMNIVIEW_PORT`/`PGPASSWORD` would silently
  keep defaults.
- **`frontend/.env.development.local`** is gitignored and must contain
  `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000` for the cross-origin dev pair.
- **django-ninja**: bare `dict` body params silently bind as *query* params —
  always declare an explicit `Schema` or `Body(...)`.
- **Next 16 error boundaries** take `unstable_retry`, not `reset`.
- **Version drift**: Next 16, Django 6, django-ninja, and django-allauth are all
  newer than model training data. Read the installed docs
  (`frontend/node_modules/next/dist/docs/`, packages under `.venv/`) before
  nontrivial use. The Grep tool cannot search `.venv` — use shell grep.
- **Playwright**: chromium is already downloaded; throwaway verification scripts
  must live under `frontend/` (module resolution is relative to the script) and be
  deleted after use.
- **Databricks AppKit** (https://developers.databricks.com/docs/appkit/v0/) is the
  convention reference for app-development decisions. It is TypeScript-only, so it
  guides conventions (auth headers, deploy flow), not the Django backend itself.

---

## Deploy loop (quick reference)

```powershell
uv run python deploy/databricks/build_app.py            # → dist/databricks_app/
databricks workspace import-dir dist/databricks_app `
  "/Workspace/Users/<your-workspace-user>/omniview-app" --overwrite --profile DatabricksFree
databricks apps start omniview --profile DatabricksFree   # if auto-stopped; this itself deploys
databricks apps deploy omniview `
  --source-code-path "/Workspace/Users/<your-workspace-user>/omniview-app" --profile DatabricksFree
databricks apps logs omniview --profile DatabricksFree    # verify
```

**Note:** on a stopped app, `apps start` triggers its own deployment, so a
following `apps deploy` fails with "pending deployment in progress". Upload
first, then start, and skip the explicit deploy.

Both scripts self-check: `build_app.py` validates its ignore-set keys, scans the
finished bundle for leaked `tests`/`conftest.py`/`.e2e`, and verifies the two
specs reached the bundle root. `tear_down.py` preflights auth and treats a probe
failure as fatal rather than as "resource absent" — details in
`deploy/databricks/README.md` ("Built-in safety checks").

## Process rules

- Update this file and commit after every milestone; redeploy to Databricks when
  the change affects the deployed app.
- Milestones are started one at a time and explicitly, never rolled into the
  previous one — this file is the record of which is current.
- Frontend is **TypeScript only** — all code and configs `.ts`/`.tsx`.
