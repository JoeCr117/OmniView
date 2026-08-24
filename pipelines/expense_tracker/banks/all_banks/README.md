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
| `golden1_schema.py` | Every CSV layout Golden1 has exported, declared as data: `LEGACY_COLUMNS` (the conformed 8-column shape), the `GOLDEN1_CSV_SCHEMAS` table, `detect_schema` (picks one by matching a file's header), and `ACCOUNT_CONVENTIONS` (how each (version, account) signs its money and balance). Holds no pandas. |
| `golden1.py` | `Golden1`: conforms each CSV to `LEGACY_COLUMNS` on its own **before** the per-account concat, parses dates and row order per that file's schema, restates signs to the one canonical convention, and fills in the per-row balances the export leaves empty. |

## Conventions & gotchas
- **Conform per file, then concat.** A file's own schema decides how its columns,
  dates and row order are read, so mixing versions in one account cannot make one
  file's shape reinterpret another's. Concatenating first yields the union of both
  column sets, half of it null.
- **Resolve columns by name, never by position.** v1 exports `Debit, Credit`
  where v2 exports `Credit, Debit`; a positional read swaps every debit and credit
  while a column-count or shape test still passes.
- **An unrecognized header raises** (`UnknownCsvSchemaError`), before any file is
  parsed. Adding a version is one more `Golden1CsvSchema` entry, not a branch.
- **`Golden1CsvSchema` stays Golden1-specific.** Move it up into a shared `banks/`
  module only when a SECOND bank independently needs schema versioning — two
  schemas of one bank is not the third occurrence.
- **Sign is declared per (version, account), never per version alone.** v1's
  header is byte-identical across all four accounts, so `detect_schema` cannot
  tell the credit card from checking — yet only the card is written from the
  issuer's side. `ACCOUNT_CONVENTIONS` is keyed by both, with two entries and a
  default; `_to_canonical_signs` applies it. See `test_golden1_sign_convention.py`.
- **v1's credit-card `Balance` is a column of literal zeros**, declared
  `BalanceMeaning.UNSTATED` and turned into NULL so `_fill_missing_balances`
  reconstructs it. v2 states one balance per *date*, so that date's earlier rows
  are reconstructed too. Anything the bank does state is copied through untouched.
- The balance reconstruction needs the `Debit` column — the E2E fixture CSVs lack
  it, which is why the E2E tier can't feed the pipeline (documented, expected).
- Keep bank-specific quirks here, not in the base `Bank`.

## See also
- [banks/](../README.md) · [factory.py](../README.md) · [common/](../common/README.md)
