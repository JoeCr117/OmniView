# backend/apps/omni_erd/

## Purpose
Omni-ERD: turns a live database catalog into an entity-relationship diagram.
Introspects a schema, normalises it into a dialect-agnostic document, infers the
relationships the catalog does not declare, and serves the result to the canvas.

## Role in OmniView
The third registered dashboard app, mounted at `/api/omni-erd/` behind
`AppAccessAuth('omni-erd')`. Read-only against every database it inspects; the
two things it writes are its own: a user's saved diagram layout, and the
relationship overrides an admin writes under `/api/omni-erd/admin/`.

The app exists because OmniView's data lives in two unrelated engines - Postgres
(Lakebase in the cloud) and Unity Catalog over Databricks SQL - and a renderer
must not learn both. `ir.py` is the seam: adapters produce it, the frontend
consumes it, neither knows the other's dialect.

## Contents
| Item | What it does |
|------|--------------|
| `ir.py` | The dialect-agnostic schema document, plus `normalize_type`. No Django imports. |
| `introspect/` | One adapter per engine. Postgres is live; Databricks is written but unconfigured. |
| `infer.py` | The four tiers that decide a pair of entities: override, declared, `*SK`, same-named PK. |
| `sources.py` | The allowlist of what may be introspected. Not discovery - an allowlist. |
| `services.py` | Builds and caches a graph; reads/writes layouts and overrides. |
| `models.py` | `ErdLayout` - one user's node positions; `ErdRelationshipOverride` - one global assertion about a pair. |
| `schemas.py` · `api.py` | The ninja wire shape and the four app-level endpoints. |
| `admin_api.py` | The staff-gated override CRUD, mounted at `/api/omni-erd/admin/`. |
| `omniview_app.py` · `apps.py` | Its declaration to the shell, and the pinned app label. |
| `tests/` | Unit tests over fixtures - no live database in the fast tier. |

## Conventions & gotchas
- **The app label is `omni_erd` and every `db_table` is pinned** -
  `omnierd_erdlayout`, `omnierd_relationshipoverride`. See `apps.py`;
  `config/tests/test_schema_contract.py` is the tripwire.
- **`datavault` declares no foreign keys and never will** - dbt builds every
  relation with CTAS, which carries no constraints. Rendering only declared
  edges would draw 22 disconnected boxes, which is the entire reason `infer.py`
  exists.
- **Casing.** dbt-postgres quotes relation names but not column identifiers, so
  `datavault` holds CamelCase relations with lowercase columns (`gold_DimDate`
  has `datesk`). Introspectors report the catalog verbatim; inference matches
  case-insensitively.
- **`ErdRelationshipOverride.entity_a`/`entity_b` are collated `C`, and must
  stay that way.** `erd_override_pair_is_ordered` re-derives in SQL the ordering
  `services.canonical_pair` decides in Python, and only `C` (byte order) matches
  Python's `<`: under glibc's `en_US.utf8` a pair like `x_Bank`/`x_account`
  sorts the other way and the CHECK rejects a row Python ordered correctly. The
  compose db is `postgres:17-alpine` (musl, byte order regardless of the locale
  label), so it cannot reproduce the disagreement - prove collation changes on a
  Debian-based `postgres:17`. `config/settings/test.py` registers `C` on SQLite,
  which otherwise fails *every* migration with "no such collation sequence: C".
- **No `datavault_labels`.** The app reads that schema's *catalog* by raw SQL
  rather than mapping its tables, and `ErdLayout` is managed and belongs in
  `omniview` - a rebuild drops `datavault` wholesale.
- **The graph cache is not keyed per user**, unlike the Admin Portal's
  Databricks caches. Those fetch on-behalf-of the caller; this runs as the app
  and returns the same catalog to everyone entitled to ask. `services.py` says
  so at the definition, because the asymmetry otherwise reads as a bug.
- **The graph cache is per *process*.** There is no `CACHES` setting, so it is
  Django's default `LocMemCache`; under gunicorn a write clears only the calling
  worker's copy and its siblings serve the previous graph until
  `GRAPH_CACHE_TTL_SECONDS` (60) expires. Never promise instant effect in UI
  copy.
- **The admin boundary is declared on `admin_router` itself, in `admin_api.py`,
  and must stay there.** `Router.add_router(auth=...)` assigns to the child
  router in place, so a boundary set at the mount is one another module can undo;
  and a *per-operation* `auth=` fails open - a forgotten kwarg falls back to the
  parent's `AppAccessAuth` and hands writes to every granted user.
- **Overrides are global, unlike layouts.** A layout has no truth value; an
  override asserts a fact about the schema and must generate the same SELECT for
  everyone, which is why writing one takes staff.
- **A stored override's pair is canonical (`entity_a < entity_b`, a
  `CheckConstraint`) with the direction living in `many_side` alone.** That is
  what makes (A, B) and (B, A) one row under a plain unique constraint, and a
  self-pair unrepresentable. `services.canonical_pair` / `override_to_ir` are the
  round trip between that row and the IR's directed ends.
- **An override's staleness is derived on every read, never stored.** A stored
  flag is a cache with no invalidation: the rebuild that restores a missing table
  does not come back to clear it, so the row would read stale forever while the
  diagram drew it correctly.
- Granting this app exposes every table and column *name* it can reach - never
  their contents. Grant deliberately.

## See also
- [apps/](../README.md) · [introspect/](introspect/README.md) · [tests/](tests/README.md)
- [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) - the app-registration contract
