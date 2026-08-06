---
name: adding-a-bank
description: Add a new financial institution to the ExpenseTracker pipeline — source data, Bank subclass, factory registration and the four dbt model layers. Use when onboarding a bank beyond Golden1.
---

# Adding a new bank

1. Get the bank's source data into the DB: either build a `<NewBank>/` directory (root `.yml`
   transaction map — same nested `Category -> SubCategories -> {Budget, Type -> Label ->
   [StringMatch,...]}` shape as Golden1's — plus one subdirectory per account containing that
   account's CSVs) and run `manage.py import_banks_dir` on its parent, or create the
   `BudgetMapDocument` + `RawFile` rows directly.
2. Add a `Bank` subclass under `pipelines/expense_tracker/banks/all_banks/` implementing
   `_parse_transactions`.
3. Register it in `pipelines/expense_tracker/banks/factory.py:bank_factory`.
4. Add matching `0-stg`/`1-bronze`/`2-silver`/`3-gold` models under
   `pipelines/expense_tracker/dbt/models/*/<NewBank>/`, following the Golden1 folder as a template,
   and add the new `stg_*` tables to a sources file under `0-stg`.

A bank's CSV export format is not necessarily stable over time. If the bank has emitted more than
one layout, declare each layout and detect which one a file uses from that file's header, then
conform it to a single target shape **before** concatenating an account's files —
`banks/all_banks/golden1_schema.py` is the worked example. Two rules from that build generalize:

- **Resolve every column by name, never by position.** Golden1's v1 and v2 money columns are
  order-inverted, so a positional read swaps every debit and credit while still passing a shape test.
- **An unrecognized header must raise, not be guessed at**, so a new export forces a declaration
  instead of silently losing a column.

`bank_factory` raises on an unregistered name, so step 3 is what makes the new subclass reachable.
See `pipelines/expense_tracker/banks/bank.py` for the base class contract and
`banks/all_banks/golden1.py` as the reference implementation.
