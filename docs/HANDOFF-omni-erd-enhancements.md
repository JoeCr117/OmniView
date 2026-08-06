# Omni-ERD enhancements — Working State

Branch `feature/omni-erd-enhancements`, worktree
`W:\Projects\Claude Projects\OmniView-omni-erd`. Resume-cold record — read this
before touching anything.

**Baselines at start**: backend `318 passed`, frontend `246 passed` (29 files).

## What is being built

1. An admin-only "Relationships" sub-tab inside Omni-ERD where an OmniView admin
   (`is_staff`) manually overrides or suppresses a relationship's join condition.
   Precedence is `admin_override > declared > inferred`.
2. The Ctrl-click multi-selection flyout generates a runnable, copyable `SELECT`
   whose joins come from the override if one exists, else the relationship the
   app already computed.

## Milestones

| # | Milestone | Files | Status | Verification |
|---|---|---|---|---|
| M1 | Inference understands overrides | `backend/apps/omni_erd/ir.py`, `infer.py` | done | all 14 existing `test_infer.py` tests pass unedited |
| M2 | `ErdRelationshipOverride` model + migration `0003_*` | `models.py`, `migrations/`, `backend/config/tests/test_schema_contract.py` | done | `makemigrations --check --dry-run` clean |
| M3 | Service layer: read, normalise, derive status, invalidate cache | `services.py` | done | service tests green |
| M4 | Staff-gated admin sub-router | `admin_api.py`, `schemas.py`, `api.py` | done | granted non-staff gets 403 `Admin access required.` |
| M5 | Dash predicate becomes `confidence < 1` | `lib/types.ts`, `toFlow.ts`, `entityDetail.ts` | done | existing toFlow/entityDetail tests pass unedited |
| M6 | Pure SQL generation | `lib/dialect.ts`, `lib/buildSelect.ts` | done | one test per case (a)-(h) |
| M7 | SelectionFlyout shows and copies the SQL | `CopyButton.tsx`, `SelectionFlyout.tsx` | done | `npm run test`, `npm run build` |
| M8 | Relationships tab visible to staff only | `apps/registry.ts`, `access.ts`, `shell/AppSubnav.tsx` | done | `test_registry.py` green |
| M9 | Override editor page | `relationships/page.tsx`, `Overrides*.tsx`, `common/AdminGate.tsx` | done | `npm run build` emits the route |
| M10 | Tests: precedence, SQL generation, admin enforcement | new test files | done | full `pytest` + `npm run test` |
| M11 | Docs: 6 READMEs + `infer.py` docstring | READMEs | done | readme-coverage test green |
| M12 | Review gate: code, security, standards, readability, design | read-only | done | findings folded back as milestones |

## M12 - review gate, outcome

Every reviewer reported. Findings and their resolution:

- **Standards** - all six contracts conform; no blockers. One correction: the claim that `AdminGate`'s denial text was kept byte-identical "so Admin Portal E2E locators survive" is false - no spec asserts that string. The practice is fine, the stated reason was not.
- **Readability** - nine requirements. R1-R6 applied; R7 and R8 applied; R9 (rename `attach` in `buildSelect.ts`) deliberately dropped as not worth the churn.
- **Security** - the boundary is proven by test, not inspection: a real `AppAccess` grant with `is_staff=False` gets 403 with `detail == 'Admin access required.'` on all four endpoints, a refused write leaves zero rows, and staff hitting a missing row get 404 - which is what proves those 403s are the admin wall. `admin_router` declares `auth=AdminAuth()` at its constructor, and `api.py` mounts it bare, because `Router.add_router(auth=...)` mutates the child in place.
- **Code review, precedence** - all six defect classes clean. Precedence holds because one `seen` set is filled strictly in tier order and dedup consults it after the higher tier has claimed a pair. The canonical-pair round trip was traced in both sort directions.
- **Code review, SQL generation** - all six clean. Aliases are positional (`t1..tn`), so collisions are structurally impossible; chain joins emit anchors before dependants; the clipboard fallback is reachable and the copied text provably equals the displayed text.
- **Design, override editor** - findings applied: the delete confirm no longer widens the row, the save notice is a `role="status"` region with reserved height, the disabled-Save reason sits beside the button with the offending pair marked inline, a missing author renders as an em dash rather than the word "unknown", and status carries an icon so it is not colour-only.
- **Design, generated SELECT - NOT COMPLETED.** Four attempts returned no critique. The surface's *functional* properties were covered by the SQL code review instead; its visual and interaction quality is unjudged and remains open.

### Defects found and fixed

- **Duplicate column pairs were accepted by both layers.** An override could carry the same pair twice, producing `... ON a.x = b.y AND a.x = b.y`. Now refused - not silently de-duplicated - at `_require_valid_ends` and at `draftProblem`, compared case-insensitively to match how columns are matched everywhere else.
- **A collation mismatch that no test could see.** `canonical_pair` orders the stored pair with Python's `<` (code points) while the `erd_override_pair_is_ordered` CHECK re-derives that ordering in SQL under the column's collation. On glibc these disagree, raising an uncaught `IntegrityError` - a 500. Fixed by pinning `entity_a`/`entity_b` to `db_collation='C'` so the database matches Python, plus translating any future disagreement to a 4xx. **The local compose db is `postgres:17-alpine` - musl `strcoll` is byte order regardless of the `en_US.utf8` label it reports - so it can never reproduce this; a collation change verified locally is unverified.** `C` and `POSIX` are Postgres built-in pseudo-collations rather than OS locale entries, so the pin is portable and a missing collation would error at `CREATE TABLE` rather than be ignored. Pinning SQLite's test tier is load-bearing: without registering a `C` collation per test connection, every app's migrations fail.
- **No tripwire for an override endpoint on the wrong router.** Adding a fifth override endpoint to `router` instead of `admin_router` would inherit `AppAccessAuth` and pass every existing test. A whole-surface assertion now maps every bound operation under `/api/omni-erd/` to its auth class.

### Deliberately deferred

- **Databricks queries are under-qualified.** `buildSelect` emits `schema.relation`; Unity Catalog's catalog level lives on the introspector and never reaches `SourceInfo`, so the frontend cannot fix it alone. The adapter is not wired to a live catalog. Recorded at both code sites.
- **A duplicate id in `selectedIds`** would let a warning name a table present in the SQL. Unreachable - `selection.ts::toggle` removes on re-click. Recorded so it is not "hardened" into dead code.
- **`R9`**, the `attach` rename in `buildSelect.ts`.
- **A `services.py` split.** Four responsibilities in one module warrants one, but a naive split cycles: `build_graph` calls `stored_overrides` and `list_overrides` calls `build_graph`. Needs a design decision, not an instruction.

## Pre-existing host-layer defect, fixed opportunistically

Not an Omni-ERD bug and separately committable: `backend/config/frontend.py` and
`backend/config/tests/test_auth_enforcement.py` only.

`_staff_only_page` exempted any path whose final segment contained a dot, on the
assumption that such paths are static assets. The Next.js static export writes
every route as a directory *and* sibling `<route>.html` and `<route>.txt` (the RSC
payload), so a signed-in non-staff user reached `/apps/admin-portal/users.html`
and `/apps/admin-portal/users.txt` by appending an extension.

What it exposed: the page shell and its React Server Component flight payload -
the admin UI's structure. What it did not expose: any user, cost or job record.
The export is static and every real value is fetched at runtime from
`/api/admin-portal/*`, which sits behind `AdminAuth` and was never affected. A
defense-in-depth layer failing to do what its docstring claimed, not a breach.

The fix drops the extension heuristic entirely rather than enumerating suffixes:
nothing under a staff-only prefix is an asset, since bundles live under `_next/`.
The gated prefixes are now a tuple, `STAFF_ONLY_PAGE_PREFIXES`.

`_needs_login` keeps the same dot check untouched. It is correct there and its
docstring says why - assets must serve before authentication.

### The dropped page gate is reversed

Previously dropped on the grounds that it would cost five files across three
packages to generalise a per-app mechanism, over a boundary already held
elsewhere. Both premises failed. `config/frontend.py` had to be opened anyway for
the bypass above, and the mechanism the gate would have reused was itself broken.
The marginal cost became one tuple entry, so `apps/omni-erd/relationships` is now
gated. It is deliberately a two-entry tuple and not a registry-driven seam.

23 new tests. Each new gated path was proven to fail against the old code before
the fix was restored.

## Verified so far

Backend `397 passed`, frontend `312 passed` (35 files). `makemigrations --check --dry-run` reports no changes; `tsc --noEmit` and `eslint src/apps/omni-erd` are clean; `npm run build` emits the `/apps/omni-erd/relationships` route.

The growth from the `367` / `274` baseline is not feature work but 30 backend and 38 frontend tests that exist because the gate found gaps, and break it down:
- backend: 23 host-layer page-gate, 3 duplicate-pair, 3 collation, 1 auth-class tripwire
- frontend: 24 `overrideDraft`, 8 `overrideText`, 6 `serverMessage`


## Decisions already made

- Precedence is `admin_override > declared > inferred`; an override beats a
  declared constraint because an override exists precisely because the
  machine's answer was judged wrong.
- An override carries `confidence = 1.0` and renders solid. The dash predicate
  moves from `origin !== "declared"` to `confidence < 1`, which restores the
  rule `ir.py` already states.
- `infer.py` stays free of Django imports; override rows are read in
  `services.py` and passed in as data.
- Overrides are global, not per-user — an override asserts a fact about the
  schema, and the generated SELECT must be the same query for everyone.
- Staleness (an override naming a table or column a rebuild removed) is
  derived at read time, never stored.
- Admin write endpoints use a dedicated sub-router declaring
  `Router(auth=AdminAuth())`, not per-operation `auth=`, because a forgotten
  per-operation kwarg fails open to `AppAccessAuth`.

## Known gaps

- No live-catalog test of override resolution against real Postgres introspection — that belongs to the E2E tier, which has not been run.
- `update_override` has thin service-level coverage generally; only the happy path and the 409 collision are exercised.

## Deliberately dropped

- The Django page-level 404 gate for `/apps/omni-erd/relationships` — **dropped,
  then reversed in M12**. The mechanism it would have reused turned out to be
  bypassable, and the file had to open anyway for the host-layer fix. See
  `## Pre-existing host-layer defect, fixed opportunistically` for detail.

## Release readiness

Verdict: READY WITH CONDITIONS.
- Migration `0003` applies to a fresh database and reverses cleanly to `0002`, leaving no orphaned constraint.
- The frontend static export must be rebuilt at release: the new route and the page-gate fix exist only in `frontend/out/`.
- No new environment variable or config.
- A rebuild drops and recreates `datavault`, but overrides live in `omniview` and survive it: an override naming a departed table reads `unknown_entity` and returns to `active` when the table comes back, with no data loss. Staleness is derived at read time, never stored.
- Post-release checks: confirm `migrate` applied `omni_erd.0003` rather than erroring on the collation clause; as staff, load `/apps/omni-erd/relationships`; as a signed-in non-staff user, confirm 404 on that path AND on its `.html` and `.txt` siblings.
- Undeterminable without a deploy: Lakebase's collation provider, and live-catalog override resolution against real introspection.

## M13 - the generated-SELECT design critique, applied

M12 left one gate unfinished: the design critique of the Ctrl-click generated-SELECT
surface, which failed four times and was genuinely unjudged. It has now run and
returned nine findings. This section is the live status record - update it as each
lands, because this work has been interrupted repeatedly and this table is what
makes each resumption cheap.

Scope is presentation, state handling and one correctness defect. **The query
*generation* was judged correct and is out of scope**: `SELECT *`, the `t1`/`t2`
aliases, quoted schema-qualified identifiers and bare `JOIN` were each explicitly
approved. Do not "improve" the dialect or the aliasing.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | The `ON` condition is clipped behind a horizontal scrollbar at every width - a 280px block holding 399px of text under `white-space: pre`. The clipped ~30% is the join condition, the most valuable thing the feature computes. | broken | done - unjudged against rendered UI |
| 2 | At 4+ tables the query is not visible at all: the table list eats the panel's fixed height and pushes the QUERY block below an internal scroll, while the copy button stays visible - a copy control for something the user cannot see. | broken | done - unjudged against rendered UI |
| 3 | **Directly-related tables are mislabelled `NOT JOINED`.** A real logic bug, not presentation - see below. | broken | done |
| 4 | The copy button stays enabled when no `SELECT` was generated, so the user copies prose into a SQL editor. | broken | done |
| 5 | The "no relationship" warning is itself clipped mid-sentence. Fixed by 1; verified separately for the warning variant. | broken | done |
| 6 | Copy affordance: 28x28 icon-only, floated below a divider, detached from the QUERY block, empty `title`, no click confirmation. Below the app's own 32px `size="sm"` icon standard. | polish | done |
| 7 | Ctrl-click is undiscoverable - the hint lives inside the flyout, so it appears only after you have already done the thing. Copy also names Ctrl alone, not Cmd. | polish | done |
| 8 | A stray canvas click destroys the whole ordered selection with no undo. | polish | done |
| 9 | SQL renders at 11px, one flat foreground colour, no syntax treatment - code the user reads and trusts before running it against a warehouse. | polish | done - unjudged against rendered UI |

Finding 9 is implemented and verified in source but not re-judged against the rendered UI. The design reviewer cannot type credentials into a sign-in form, and OmniView's auth cannot be stood down for a review; the critique needs a browser profile already signed in or an equivalent human step. Finding 9's open question is whether bold-weight keyword spans at 12px read as syntax treatment in both light and dark themes — that judgement only the rendered UI can settle.

### Finding 8 - resolution approach

Clearing the selection on a stray canvas click is destructive with no undo, so that action had to move to a gesture that is deliberate. Escape was chosen over a confirm because the selection is cheap to rebuild. It is scoped to fire only while a selection exists and to ignore the key when it originates from an `INPUT`, `TEXTAREA` or `contentEditable` element, so `SearchBar` keeps owning Escape for collapsing itself.

### Finding 3 in full - the only correctness defect

`buildSelect` roots the statement at the first pick and grows a chain outward.
Anything the chain cannot reach is `excluded`, and the flyout labels those rows
`NOT JOINED`. With picks `auth_group`, `auth_permission`, `django_content_type`,
`rawdata_rawfile`, the pair `auth_permission -> django_content_type` is a genuine
foreign key **with an edge drawn on the canvas**, yet both rows read `NOT JOINED`,
because neither is reachable from `auth_group` without the unpicked bridge
`auth_group_permissions`. The app contradicts a relationship it is visibly drawing.

**Remedy: option (a)** - keep one query, but when the selection is not fully
connected, say *why* and name the remedy ("add `auth_group_permissions` to connect
`auth_group` and `auth_permission`"), with a one-click action to add that bridging
table where one exists. Chosen over (b), emitting one `SELECT` per connected
component: a user copying SQL wants one query, and being told which table would
connect their selection is more actionable than silently receiving two.

Two constraints on the implementation, both found by reading rather than assumed:

- **The join predicate must have exactly one home.** Connectivity and SQL
  generation deciding "can these two join?" separately would let the UI offer a
  bridge the SQL builder then refuses to use. `joinColumns` therefore moves out of
  `buildSelect.ts` into the new `lib/joinGraph.ts` and is imported back.
- **The remedy enriches the existing `disconnected` warning; it may not add a
  second one.** `buildSelect.test.ts:195` already encodes this exact shape and
  asserts `warnings).toHaveLength(1)`; `:192` pins the code string and `:212` pins
  `entityIds`. All 16 tests in that file must pass unedited.

Appending the bridge at the end of the pick order is sufficient to connect the
query - `planJoins` repeats passes until one adds nothing, so a bridge picked last
is still attached on an earlier pass than the tables that depend on it.

### Verified baseline this work must hold

Backend `397 passed` - frontend `338 passed` (37 files) - `tsc --noEmit` clean - `makemigrations --check` clean.

## M13e - code review gate, outcome

A scoped code review of finding 3's logic (`lib/joinGraph.ts` + `lib/buildSelect.ts` and their tests) returned no blocking findings. It confirmed by proof sketch that `joinGroups` is a correct connected-components partition and that its ordering contract holds — group 0 always holds `picked[0]`, which is what makes `groups.slice(1)` sound — and that exactly one `disconnected` warning is still emitted.

Three accepted findings were fixed:
- `buildSelect` now dedupes its selection locally rather than trusting a remote invariant in `selection.ts::toggle`. A repeated id previously produced a warning that contradicted the emitted SQL, claiming a table was left out while it was `t1`.
- The "no single table would connect them" sentence now depends on whether a remedy exists, not on whether any excluded group happened to have more than one member. The same fact was previously stated or withheld based on a property the user does not care about.
- The bridge tie-break dropped `localeCompare` for a codepoint comparison, so the order cannot differ between a browser locale and CI.

Four test-coverage gaps were closed (test count 334 → 338), the load-bearing one being that `remedyBridge` was asserted nowhere: a refactor to `suggestedBridges[0] ?? null` would have kept the whole suite green while re-introducing an offer that contradicts the sentence above it.

Two findings were deliberately declined:
- The ranking of `suggestedBridges` by "most groups merged" stays, even though a bridge that merges two non-root groups can outrank one that actually fixes the query. `remedyBridge` re-scans for a root-touching bridge, so the UI is unaffected, and the contract is documented in `buildSelect.ts`.
- `joinColumns` keeps its per-pair scan over all relationships. At ~300 entities it costs tens of milliseconds inside a `useMemo`, and the expensive bridge-ranking path only runs when the selection is already disconnected. The fix when a ~1000-entity catalog appears is one `Map<entityId, Relationship[]>` adjacency, not a restructure.

One known limit: when a selection splits into three or more groups and the offered bridge touches only some of them, adding it reconnects those and leaves the rest warned about. The remedy is iterative, not one-click, and the sentence names the groups it actually reconnects rather than saying "them".

## M13f - design gate, outcome

The design re-critique of findings 1, 2 and 9 against the running app did not run. The design reviewer cannot type credentials into a sign-in form, and OmniView's auth cannot be stood down for a review. It needs a browser profile already signed in, or an equivalent human step, before it can be re-attempted. Findings 1, 2 and 9 are therefore implemented and verified in source, but unjudged against the rendered UI.

## Not run

- Playwright E2E (`npm run e2e`). Port 8100 and the `omniview_e2e` database are
  shared with a concurrent worktree. Pending, to be run serialized by the user
  after both features land.
- M13f design gate (findings 1, 2, 9). Cannot proceed without a browser profile
  already signed in to OmniView; auth cannot be stood down for review.
