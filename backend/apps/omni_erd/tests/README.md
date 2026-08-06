# backend/apps/omni_erd/tests/

## Purpose
Unit tests for Omni-ERD: type normalisation across both dialects, relationship
inference, admin overrides, and the API's access control.

## Role in OmniView
Runs in the fast backend tier (`uv run pytest`, in-memory SQLite). Nothing here
touches a live Postgres or a Databricks warehouse - the adapters are built to be
testable from catalog *rows*, which is what makes that possible.

## Contents
| Item | What it does |
|------|--------------|
| `fixtures.py` | Hand-built `ir` graphs shaped like the real `datavault`, plus `FakeIntrospector`. |
| `test_ir.py` | Asserts Postgres and Databricks type spellings land on the same `base`. |
| `test_infer.py` | The inference guarantees: declared wins, guesses are labelled, no self- or off-canvas edges. |
| `test_overrides_infer.py` | Tier order: an override outranks a declared constraint, and renders solid. Pure, no DB. |
| `test_overrides_service.py` | The canonical-pair round trip, status derived per read, and the anonymous-actor path. |
| `test_overrides_api.py` | The privilege boundary: granted-but-not-staff is refused, by message not just status. |
| `test_api.py` | Grant enforcement, layout ownership, allowlist validation. |

## Conventions & gotchas
- **Fixtures mirror production naming deliberately**: CamelCase relations with
  lowercase columns, because that is what dbt-postgres leaves behind (it quotes
  relation names but not column identifiers). A fixture that doesn't look like
  the database proves nothing about the case-insensitive matching.
- **The Databricks tests are the dialect-agnostic claim.** If the IR only held
  for Postgres it would be a Postgres schema with a general-sounding name, so
  `test_ir.py` asserts the two dialects pairwise rather than one at a time.
- **Anything reaching `build_graph` must patch the introspector.** The fast tier
  is in-memory SQLite, which has no `pg_class`, so the override tests point
  `sources.PostgresIntrospector` at `FakeIntrospector` rather than standing up a
  database. Everything downstream - cache, inference, override resolution - is
  the real code path.
- **Clear the graph cache around any test that writes an override.**
  `build_graph` caches for 60s, which outlives a test; `test_overrides_service.py`
  does it in an autouse fixture.
- **Refusals are asserted by message, not only by status.** `AppAccessAuth` and
  `AdminAuth` both 403, so the wording is the only proof that the admin check
  actually ran.
- No live-catalog test lives here. Introspecting a real schema is verified by
  hand against the compose stack (see docs/HANDOFF.md), not in the fast tier.

## See also
- [omni_erd/](../README.md) · [introspect/](../introspect/README.md)
