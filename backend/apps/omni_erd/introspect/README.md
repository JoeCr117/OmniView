# backend/apps/omni_erd/introspect/

## Purpose
One adapter per database engine, each turning that engine's catalog into the
`ir` types and nothing else.

## Role in OmniView
This is where Omni-ERD's dialect-agnosticism is actually earned. `base.py`
declares the protocol; the rest of the app depends only on it, so adding an
engine means adding a module here and a row in `sources.py`.

## Contents
| Item | What it does |
|------|--------------|
| `base.py` | The `SchemaIntrospector` protocol and `IntrospectionUnavailable`. |
| `postgres.py` | Live. Reads a schema through an existing Django connection alias. |
| `databricks.py` | Unity Catalog over Databricks SQL. Queries complete, parsing tested, **not wired to a live catalog**. |

## Conventions & gotchas
- **Adapters do no inference, no caching and no HTTP.** They are pure catalog →
  `ir`, which is what lets them be tested by feeding in rows with no database
  anywhere.
- **Postgres reads `pg_class`, not `information_schema.tables`** - the latter
  omits materialized views entirely.
- **Postgres reads foreign keys from `pg_constraint`, not
  `constraint_column_usage`**, whose row order does not reliably pair the
  referencing and referenced columns of a *composite* key. `conkey`/`confkey`
  are ordinal arrays, so the pairing is unambiguous.
- **UC's PK/FK constraints are informational and `NOT ENFORCED`.** Irrelevant
  here: an ERD wants metadata, not enforcement, so a non-enforced FK is exactly
  as drawable as a Postgres one.
- **`databricks.py` duplicates ~15 lines of the Admin Portal's client factory on
  purpose.** An `omni_erd -> admin_portal` import would mean deleting the Admin
  Portal breaks Omni-ERD, which is precisely the coupling
  `docs/ARCHITECTURE.md` bans. If a third app needs a workspace client, promote
  one to `shell/` rather than letting apps import each other. The intent differs
  too: the portal authenticates on-behalf-of the visiting admin, while schema
  metadata is not per-user and uses app identity only.
- Every statement in here is a SELECT against a catalog. Nothing writes.

## See also
- [omni_erd/](../README.md) · [ir.py](../ir.py) · [infer.py](../infer.py)
