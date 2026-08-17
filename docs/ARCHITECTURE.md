# OmniView — architecture and project structure

OmniView is a multi-app dashboard: **ExpenseTracker** (bank CSVs → budgets and balances),
**Omni-ERD** (entity-relationship diagrams over live database catalogs) and the **Admin Portal**
(users, access, Databricks costs and jobs, the API reference). The structure below existed so that
the third app would be a checklist rather than an excavation — Omni-ERD was that third app, and it
was: one line in each registry, no shell edits.

This document is the **contract**: where each kind of code lives, and what you must touch to add an
app. `CLAUDE.md` is the quick reference; this is the reasoning. Per-folder `README.md` files (QOL6)
document individual directories.

---

## The three layers, and the one rule between them

```
frontend/     Next.js static export. Talks to the backend over /api/*. Nothing else.
backend/      Django + django-ninja. Serves the export, owns auth, owns the ORM.
pipelines/    The ETL. Rebuilds the warehouse tables the backend reads.
```

**The backend and the pipelines never import each other.** The backend *runs* a pipeline as a
subprocess (`backend/shell/pipeline.py` → `python -m pipelines.<app>.main`), and the pipeline reads
the tables Django owns with raw SQL, because it is not a Django process and has no ORM.

That raw SQL is the only real coupling in the repo, and it is load-bearing:

> Django derives a model's table name from its app's **label**, and the label defaults to the last
> component of the app's package path. So *moving a package silently renames its tables.* Two of
> those tables (`budgets_budgetmapdocument`, `rawdata_rawfile`) hold **production data** and are
> named literally in `pipelines/expense_tracker/banks/source.py`, which the ORM cannot keep in step.
>
> Therefore: **every AppConfig pins `label` explicitly and every managed model pins `db_table`.**
> Packages may move freely; labels may not. `backend/config/tests/test_schema_contract.py` asserts
> the labels, the table names, and that the pipeline's constants still match the models. If you find
> yourself renaming an app label, stop.

---

## `backend/` — the web layer

```
backend/
  config/            The Django project, not an app: settings/, urls, api.py (the NinjaAPI),
                     db_router.py, middleware.py, pg_lakebase/ (the Lakebase DB engine).
  shell/             OmniView ITSELF - everything true of every app:
                     registry.py  the one list of apps (below)
                     appspec.py   the OmniViewApp shape an app declares
                     security.py  SessionAuthWhenRequired / AdminAuth / AppAccessAuth
                     auth_api.py  /api/auth  ·  logs_api.py  /api/logs
                     remote_auth.py  Databricks identity-header sign-in
                     pipeline.py  run_pipeline(module, root) - generic, knows no app
  apps/
    expense_tracker/ ONE PACKAGE PER DASHBOARD APP:
      omniview_app.py  its declaration to the shell
      api.py           composes its routers into one, mounted at /api/expense-tracker/
      pipeline.py      binds the Rebuild endpoint to pipelines/expense_tracker
      budgets/ rawdata/ transactions/ dailymetrics/   its Django apps
      tests/           its fixtures + the data they load
    omni_erd/
      ir.py            the dialect-agnostic schema document (no Django imports)
      introspect/      one adapter per engine: postgres.py (live), databricks.py (unwired)
      infer.py         the edges a warehouse doesn't declare  ·  sources.py  the allowlist
      models.py (ErdLayout)  services.py  api.py  schemas.py
    admin_portal/
      omniview_app.py  api.py  models.py (AppAccess)  services.py  databricks.py  errors.py  sql/
```

**Two databases, one server.** `default` → schema `omniview` (Django's own tables, plus the managed
source data that must survive a rebuild). `datavault` → schema `datavault` (the dbt gold tables, read
through *unmanaged* models). `config/db_router.py` routes on the model's `managed` flag and keeps
migrations off `datavault` — the pipeline drops and recreates everything in there, so Django must own
nothing in it.

### The registry: one declaration, five consequences

`backend/shell/registry.py` is the single list of OmniView's apps. Each app declares itself in its
own `omniview_app.py` (shape: `shell/appspec.py`), and that one declaration drives **all** of:

| Consequence | Consumer |
|---|---|
| `INSTALLED_APPS` | `config/settings/base.py` |
| the `/api/<id>/` mount **and its auth** | `config/api.py` |
| datavault DB routing (`DATAVAULT_APPS`) | `config/db_router.py` |
| which apps an admin can grant (`GRANTABLE_APP_IDS`) | `apps/admin_portal/models.py` |
| pre-OmniView URL redirects (`LEGACY_REDIRECTS`) | `config/frontend.py` |

These were five hand-maintained lists, and nothing kept them in agreement. Now the shell never names
an app, and an app never edits the shell.

### Access control

Deny-by-default. A non-staff user sees and reaches **only** the apps they hold an `AppAccess` row
for; staff bypass everything. Enforced at the router (`AppAccessAuth("<id>")` / `AdminAuth()`), which
django-ninja inherits down into an app's nested routers. The frontend registry filter is *cosmetic* —
**the API is the security boundary.** `OMNIVIEW_AUTH_REQUIRED=0` disables the lot, for local work.

---

## `frontend/` — the shell and its apps

```
frontend/src/
  app/                  Routes only, and thin. (auth)/login is chrome-less; (shell)/ is the dashboard.
                        Pages live at (shell)/apps/<app-id>/<tab>/page.tsx.
  apps/
    registry.ts         The frontend half of the app list: icons, nav, basePath, adminOnly.
    access.ts           visibleApps(user, config) - the deny-by-default filter.
    <app-id>/           THAT APP'S CODE, AND NOTHING ELSE: components/, lib/api.ts.
  components/
    ui/                 shadcn primitives. Generated; edit sparingly.
    shell/              OmniView's chrome: Header, AppRail, TabBar, ViewportPane, AppSubnav, UserMenu.
    common/             CROSS-APP components: DataTable, Pager, AsyncState, KpiCard, skeletons.
    charts/             TimeSeriesChart (the one chart), its lazy wrapper, and LTTB downsampling.
  lib/                  http.ts (apiFetch + apiUpload: credentials, CSRF, the 401 event, XHR
                        upload progress), auth.tsx, tabs.tsx, useResource.ts (the read cache),
                        log.ts, utils.ts
  hooks/                useFullscreen, useDebouncedValue
```

**The shell's shape**: `Header` across the top; `AppRail` down the left (always visible, collapsible
to icons, marks the app you're in); and the viewport filling the rest, which holds the `TabBar` and
the focused app. The viewport — not the whole page — is the fullscreen target, so fullscreening keeps
your tabs and drops only the chrome.

**Tabs are a list, not a renderer.** `lib/tabs.tsx` owns *which* apps are open, in what order, and
the last URL visited in each (so re-selecting an app returns you to where you left it). The **URL
remains the source of truth for which tab is focused** — derived from the pathname, never the other
way round. That is what keeps deep links, refresh, the back button and Django's URL-based staff gate
all working untouched.

> Do not try to keep backgrounded apps mounted by caching the `children` a client layout receives.
> In the App Router that prop is not a snapshot of a tree — it is a live slot that resolves to
> whichever route is current, so rendering a cached copy just renders the *current* page again. This
> was tried; both panes rendered the same page. Backgrounded apps unmount, and we compensate with the
> remembered href, restored scroll (`ViewportPane`), and the resource cache.

**Apps must not import from other apps.** This is enforced, not merely asked: `eslint.config.mjs`
carries an `import/no-restricted-paths` zone per app. It exists because the Admin Portal *did* import
`AsyncState`, `Pager` and `LineChart` out of `@/apps/expense-tracker/components/` — meaning deleting
ExpenseTracker would have broken the Admin Portal. If two apps need a thing, it moves to
`components/common` (or `charts`/`ui`). If one app needs it, it stays in `apps/<id>/`.

The two registries (`shell/registry.py` and `apps/registry.ts`) can't be generated from one another —
one carries auth and DB routing, the other carries icons and nav. So they are **asserted** to agree
on app ids by `backend/shell/tests/test_registry.py`.

Constraint worth internalizing: the frontend is a **static export** (`output: "export"`). No
middleware, no server actions, no `redirects()`. Every URL must correspond to an exported `.html`
file or Django 404s it on a hard refresh. Django owns redirects and page-level auth gating.

---

## `pipelines/` — the ETL

```
pipelines/
  common/            process.py (run_command, timed)  ·  paths.py (temp_cd)
                     postgres.py (pg_engine, schema names)  ·  pydbt/ (fluent dbt CLI wrapper)
  expense_tracker/   main.py  ·  banks/ (parse CSVs → staged tables)  ·  dbt/ (bronze → silver → gold)
```

Run one from the repo root: `uv run python -m pipelines.expense_tracker.main`. The `-m` matters — it
is what puts the repo root on `sys.path` so `pipelines.*` resolves, and it's how the Rebuild button
invokes it too.

A rebuild drops and recreates everything in `datavault` from the source rows in `omniview`. That is
the whole "delete and rebuild" story, and it's why nothing Django owns may live in `datavault`.

---

## Adding a new OmniView app: the checklist

**Backend**
1. `backend/apps/<app>/omniview_app.py` — declare an `OmniViewApp` (id, router, django_apps,
   datavault_labels, admin_only, legacy_pages, errors).
2. `backend/apps/<app>/api.py` — expose a `router`.
3. Add it to `OMNIVIEW_APPS` in `backend/shell/registry.py`. **That's the whole wiring.**
4. If it has Django apps: pin `label` in each AppConfig and `db_table` on each managed model. Not
   optional — see the rule at the top.

**Frontend**
5. Add an `AppDefinition` to `frontend/src/apps/registry.ts` (id must match step 1).
6. Routes under `frontend/src/app/(shell)/apps/<id>/`, app code under `frontend/src/apps/<id>/`.

**If it needs an ETL**
7. `pipelines/<app>/main.py`, and a thin `backend/apps/<app>/pipeline.py` calling
   `run_pipeline("pipelines.<app>.main", settings.PIPELINE_ROOT)`.

**Docs**
8. A `README.md` in each of the app's package roots (the standard format below) — that is where the
   app's internals are documented, never the root `CLAUDE.md`, which stays host-level.
9. Beside each of those, a one-line `CLAUDE.md` containing `@README.md`. Nested `CLAUDE.md` files are
   read on demand when an agent works in that directory, so an app's specifics cost nothing at
   session start and arrive automatically when they're relevant.

**What you do NOT touch:** `INSTALLED_APPS`, `config/api.py`, `config/db_router.py`,
`config/frontend.py`, `admin_portal/models.py`. If you find yourself editing the shell to add an app,
the registry is missing something — extend `appspec.py` instead.

---

**Charts go through the primitives in `components/charts/`.** Not because a wrapper is tidy, but
because the things that make a chart *readable* — both axes titled, the value axis carrying its unit,
a cursor tooltip naming the underlying row — are exactly the things that get skipped when each page
rolls its own. `ariaLabel` is required on every one of them for the same reason: the chart this
replaced hardcoded one, and so described every chart as a balance chart. Each is imported through its
`Lazy*` wrapper — Recharts is ~100KB and most pages plot nothing.

A page picks by what it is *saying*: `TimeSeriesChart` for a value over time (long series are thinned
by LTTB in `charts/downsample.ts`, which *selects* real rows rather than averaging them, so the
crosshair always lands on a real day); `WaterfallChart` for how a running total got where it did;
`CategoryPieChart` for parts of a whole. Adding a fourth means the same bar: it carries the
readability invariants by construction, or it does not belong here.

**Categorical colour is a fixed set of eight, never cycled.** `--chart-1..5` are *series* colours
(assigned in registration order); `--chart-cat-1..8` are *identity* colours, for a chart where the
colour means "this category" rather than "the second line". There are eight because past that,
adjacent classes stop being tellable apart — so a ninth category folds into `Other` (`--chart-other`,
a neutral, because Other is not a category) rather than inventing a hue. The values are not
eyeballed: they pass a lightness band, a chroma floor, adjacent-pair separation under the three
common colour-vision deficiencies, and a contrast check, in both themes. Re-validate before changing
one.

**Data fetching goes through `useResource`.** A page that reads an endpoint uses
`useResource(key, fetcher)` (a stale-while-revalidate cache over `apiFetch`), not
a hand-rolled `useState(null)` + `load()`. The rule it enforces: **a first load
shows a shaped skeleton; a refetch keeps the stale content and shows a
`RefreshBar` — it never blanks.** The cache key is the contract: two surfaces
that read the same payload (Check Book and Daily Trends → `DAILY_METRICS_KEY`)
must share a key so the fetch happens once and a tab-switch repaints from cache.
The shell boots in one round-trip via `GET /api/auth/session` (config + user +
CSRF cookie); the split `/config`·`/csrf`·`/me` endpoints remain for CSRF
refresh after login/logout.

## Conventions that bite if ignored

- **TypeScript only** on the frontend. No `.js`/`.jsx`.
- **Port 8000 is the user's production container.** Verify on 8010 (compose) or 8100 (e2e). Never 8000.
- **Docker/compose and any `/Workspace/...` CLI path: PowerShell only.** Git Bash's MSYS translation
  mangles them.
- **`Data/` is production data.** Tests never read or write it: the unit tier uses in-memory DBs and
  fixtures, the E2E tier a dedicated `omniview_e2e` database.
- **Never run the pipeline against Lakebase with your own credentials.** dbt tables would end up owned
  by your role, and the app's service principal could no longer drop them. The in-app Rebuild is the
  only supported cloud rebuild path. (See DEPLOYMENT.md, "Two ways to brick the deployed app".)
- django-ninja request bodies need an explicit `Schema` or `Body(...)`; a bare `dict` binds as a query
  parameter.

## Per-folder READMEs

Every source folder carries a `README.md` in one standardized format, as a map
for maintainers: **Purpose → Role in OmniView → Contents (a file/subdir table) →
Conventions & gotchas → See also**. They're written by hand from the real code —
the value is the *why*, which no generator produces — and
`backend/config/tests/test_readme_coverage.py` fails if a source folder ships
without one or a README is missing a standard heading.

The sweep **deliberately skips genuinely contentless directories**, so their
absence reads as intentional rather than forgotten: VCS/dependency/build output
(`.git`, `.venv`, `node_modules`, `.next`, `out`, `dist`, `staticfiles`,
test-results, caches), Django `migrations/`, generated dbt artifacts
(`target`, `logs`, `dbt_packages`) and its empty starter dirs (`analyses`,
`seeds`, `snapshots`, `macros` — a lone `.gitkeep`), the E2E scratch dir, the
top-level `Data/` production tree, and fixture *data* trees (documented once in
their `tests/` README, not per-leaf). The repo-root `README.md` is the project
intro and intentionally does not follow the per-folder format.

## Where else to look

- `CLAUDE.md` — quick orientation and the day-to-day commands.
- `DEPLOYMENT.md` — running it, every env var, the Databricks/Lakebase runbook and its failure modes.
- `HANDOFF.md` — the working state: what exists, known issues, and outstanding tasks.
- Per-folder `README.md` — what each directory contains and why (see above).
