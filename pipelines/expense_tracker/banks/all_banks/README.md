# pipelines/expense_tracker/banks/all_banks/

## Purpose
The concrete `Bank` implementations — one module per financial institution.
Each implements `_parse_transactions()` for that bank's specific CSV export
format.

## Role in OmniView
`factory.py` maps a bank name to one of these classes. Currently only `Golden1`
is implemented; a new institution is a new module here plus a factory case and
matching dbt models.

## Contents
| Item | What it does |
|------|--------------|
| `golden1.py` | `Golden1`: concatenates each account's CSVs, derives dates, and recomputes CreditCard intraday running balances against a known anchor (the exported balances aren't reliable intraday). |

## Conventions & gotchas
- The intraday-balance fix needs the `Debit` column — the E2E fixture CSVs lack
  it, which is why the E2E tier can't feed the pipeline (documented, expected).
- Keep bank-specific quirks here, not in the base `Bank`.

## See also
- [banks/](../README.md) · [factory.py](../README.md) · [common/](../common/README.md)
