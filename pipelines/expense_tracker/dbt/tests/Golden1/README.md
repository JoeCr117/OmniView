# pipelines/expense_tracker/dbt/tests/Golden1/

## Purpose
Golden1 transaction-invariant data tests: SQL assertions that the built transaction
tables still say what bronze said — that no model above bronze has changed a
transaction's sign or magnitude.

## Role in OmniView
Runs during `dbt build`. It is the warehouse-side backstop for the sign convention
the parser establishes: `golden1_schema.py` declares how each (schema version,
account) states its money, and `golden1.py` normalizes every row to one convention
before staging. This test fails the build if a model re-introduces a correction
below that point — which is the defect it was written for, a `*-1` in
`silver_Golden1_CreditCard` that corrected the 2024/2025 export and inverted 2026.

## Contents
| Item | What it does |
|------|--------------|
| `TransactionSignSurvivesSilver.sql` | Fails if any account's daily transaction total differs between bronze and gold. |

## Conventions & gotchas
- A dbt data test passes when the query returns **zero** rows — the SQL selects
  the *violations*.
- Compared per (account, day), not per row: silver carries no transaction key.
- Money is compared as `numeric`, never the `double precision` gold exposes —
  summing floats fails a test that should pass.

## See also
- [tests/](../README.md) · [banks/](../../../banks/README.md)
