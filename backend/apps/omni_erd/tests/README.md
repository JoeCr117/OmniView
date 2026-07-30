# backend/apps/omni_erd/tests/

## Purpose
Unit tests for Omni-ERD: type normalisation, relationship inference, the
Databricks row parsing, and the API's access control.

## Role in OmniView
Runs in the fast backend tier (`uv run pytest`, in-memory SQLite). Nothing here
touches a live Postgres or a Databricks warehouse - the adapters are built to be
testable from catalog *rows*, which is what makes that possible.

## Contents
| Item | What it does |
|------|--------------|
| `fixtures.py` | Hand-built `ir` graphs shaped like the real `datavault`. |
| `test_ir.py` | Asserts Postgres and Databricks type spellings land on the same `base`. |
| `test_infer.py` | The inference guarantees: declared wins, guesses are labelled, no self- or off-canvas edges. |
| `test_databricks_parsing.py` | UC `information_schema` rows → the same `ir` shapes Postgres produces. |
| `test_api.py` | Grant enforcement, layout ownership, allowlist validation. |

## Conventions & gotchas
- **Fixtures mirror production naming deliberately**: CamelCase relations with
  lowercase columns, because that is what dbt-postgres leaves behind (it quotes
  relation names but not column identifiers). A fixture that doesn't look like
  the database proves nothing about the case-insensitive matching.
- **The Databricks tests are the dialect-agnostic claim.** If the IR only held
  for Postgres it would be a Postgres schema with a general-sounding name, so
  `test_ir.py` asserts the two dialects pairwise rather than one at a time.
- No live-catalog test lives here. Introspecting a real schema is verified by
  hand against the compose stack (see docs/HANDOFF.md), not in the fast tier.

## See also
- [omni_erd/](../README.md) · [introspect/](../introspect/README.md)
