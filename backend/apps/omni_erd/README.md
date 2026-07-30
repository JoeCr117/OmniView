# backend/apps/omni_erd/

## Purpose
Omni-ERD: turns a live database catalog into an entity-relationship diagram.
Introspects a schema, normalises it into a dialect-agnostic document, infers the
relationships the catalog does not declare, and serves the result to the canvas.

## Role in OmniView
The third registered dashboard app, mounted at `/api/omni-erd/` behind
`AppAccessAuth('omni-erd')`. Read-only against every database it inspects: the
only thing it writes is a user's own saved diagram layout, in its own table.

The app exists because OmniView's data lives in two unrelated engines - Postgres
(Lakebase in the cloud) and Unity Catalog over Databricks SQL - and a renderer
must not learn both. `ir.py` is the seam: adapters produce it, the frontend
consumes it, neither knows the other's dialect.

## Contents
| Item | What it does |
|------|--------------|
| `ir.py` | The dialect-agnostic schema document, plus `normalize_type`. No Django imports. |
| `introspect/` | One adapter per engine. Postgres is live; Databricks is written but unconfigured. |
| `infer.py` | Guesses the edges a warehouse doesn't declare, from naming convention. |
| `sources.py` | The allowlist of what may be introspected. Not discovery - an allowlist. |
| `services.py` | Builds and caches a graph; reads/writes layouts. |
| `models.py` | `ErdLayout` - one user's node positions for one diagram. |
| `schemas.py` · `api.py` | The ninja wire shape and the four endpoints. |
| `omniview_app.py` · `apps.py` | Its declaration to the shell, and the pinned app label. |
| `tests/` | Unit tests over fixtures - no live database in the fast tier. |

## Conventions & gotchas
- **The app label is `omni_erd` and `ErdLayout.db_table` is `omnierd_erdlayout`,
  both pinned.** See `apps.py`; `config/tests/test_schema_contract.py` is the
  tripwire.
- **`datavault` declares no foreign keys and never will** - dbt builds every
  relation with CTAS, which carries no constraints. Rendering only declared
  edges would draw 22 disconnected boxes, which is the entire reason `infer.py`
  exists.
- **Casing.** dbt-postgres quotes relation names but not column identifiers, so
  `datavault` holds CamelCase relations with lowercase columns (`gold_DimDate`
  has `datesk`). Introspectors report the catalog verbatim; inference matches
  case-insensitively.
- **No `datavault_labels`.** The app reads that schema's *catalog* by raw SQL
  rather than mapping its tables, and `ErdLayout` is managed and belongs in
  `omniview` - a rebuild drops `datavault` wholesale.
- **The graph cache is not keyed per user**, unlike the Admin Portal's
  Databricks caches. Those fetch on-behalf-of the caller; this runs as the app
  and returns the same catalog to everyone entitled to ask. `services.py` says
  so at the definition, because the asymmetry otherwise reads as a bug.
- Granting this app exposes every table and column *name* it can reach - never
  their contents. Grant deliberately.

## See also
- [apps/](../README.md) · [introspect/](introspect/README.md) · [tests/](tests/README.md)
- [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) - the app-registration contract
