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

`bank_factory` raises on an unregistered name, so step 3 is what makes the new subclass reachable.
See `pipelines/expense_tracker/banks/bank.py` for the base class contract and
`banks/all_banks/golden1.py` as the reference implementation.
