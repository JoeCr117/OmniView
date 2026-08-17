# backend/apps/expense_tracker/tests/

## Purpose
The ExpenseTracker app's shared test scaffolding: pytest fixtures and the small
bank-tree fixture data they load. Demo-data seeding lives here too, so the E2E
bootstrap can reuse it.

## Role in OmniView
`fixtures.py` provides `golden1_data` (seeds a budget map + CSVs) used across the
app's tests, and `seed_demo_data()` which `e2e_bootstrap` calls. The fixture bank
tree under `data/` is a tiny stand-in for `Data/Banks` — tests never read the
real production tree.

## Contents
| Item | What it does |
|------|--------------|
| `fixtures.py` | pytest fixtures + `VALID_BUDGET_MAP` + `seed_demo_data()`. |
| `data/` | A miniature `banks/Golden1/<account>/*.csv` fixture tree (documented here, not per-leaf). |

## Conventions & gotchas
- `data/` holds fixture CSVs and `datavault_schema.sql` only; it is intentionally
  excluded from per-folder README coverage (it's data, not code).
- `datavault_schema.sql` seeds expenses **negative** on deposit accounts as well
  as on the card, matching the real Golden1 exports. `docs/examples`' CSVs carry
  the opposite credit-card sign; seeding from those would invert every spend
  visual. `transactions/tests/test_breakdown.py` is the tripwire.
- Keep all ExpenseTracker fixtures here — this is where they were consolidated in
  the QOL1 restructure.

## See also
- [expense_tracker/](../README.md) · [shell/management/commands/](../../../shell/management/commands/README.md) (e2e_bootstrap)
