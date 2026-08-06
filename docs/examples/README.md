# Examples

Synthetic sample data. Every merchant, amount, account number and reference
number in here is invented — nothing in this directory is real financial data.

## `Banks/` — a `Data/Banks`-style source tree

This is the input shape `manage.py import_banks_dir` expects, and the format a
new bank's directory has to follow (see CLAUDE.md "Adding a new bank"):

```
Banks/
└── <BankName>/
    ├── BudgetMap.yml               exactly ONE root .yml - the budget map
    └── <AccountName>/              one directory per account
        └── *.csv                   that account's exported transactions
```

`import_banks_dir` requires **exactly one** root `.yml` per bank directory and
errors out otherwise, so a real deployment's `Data/Banks/<Bank>/` holds only its
own budget map — which is why this example lives here rather than beside it.

Load it into the `omniview` schema the same way as the real tree:

```
uv run python backend/manage.py import_banks_dir docs/examples/Banks
```

That writes one `BudgetMapDocument` row per bank and one `RawFile` row per CSV;
it upserts on `(bank, account, filename)`, so re-running only refreshes content.
Because the bank name here is `Golden1`, importing this example **overwrites the
real Golden1 rows** — point it at a scratch database, not a live one.

### The budget map

`Banks/Golden1/BudgetMap.yml` documents the full nested format —
`Category -> SubCategories -> Type -> Label -> [StringMatch, ...]`, optional
`Budget` at the category and subcategory levels — and its header comments cover
the authoring rules that are easy to get wrong (first-match-wins containment,
when to quote a match, the parent/child budget constraint that
`dbt/tests/Budgets/CatToSubCatSums.sql` enforces).

### The CSVs

Golden1 has exported two layouts, and every account here carries one file of
each. Both are declared in
`pipelines/expense_tracker/banks/all_banks/golden1_schema.py`, which picks one
per file by matching its header.

`2024.csv` — the legacy layout (v1), 8 columns, rows oldest-first:

```
"Date","ReferenceNo.","Type","Description","Debit","Credit","CheckNumber","Balance"
```

`2026.csv` — the 2026 layout (v2), 9 columns, rows newest-first:

```
"Date","Account","Account Type","Description","Check #","Category","Credit","Debit","Daily Balance"
```

**The money columns are order-inverted between the two**: v1 emits
`Debit, Credit` and v2 emits `Credit, Debit`. Reading either header by position
swaps every debit and credit while a column-count check still passes, so
`golden1.py` resolves every column by name. v2 also carries no `ReferenceNo.`
and no transaction-direction `Type` (its `Account Type` is the account *kind*,
not the direction); `Account`, `Account Type` and `Category` are dropped.

In both layouts `Debit` is negative and `Credit` positive, with one of the two
blank per row; the pipeline sums them into `TransactionAmount`. A different bank
exports a different shape — that is exactly what a new `Bank` subclass's
`_parse_transactions()` exists to normalize.

The `Description` values here are written to hit the `StringMatch` entries in
the example budget map, so a pipeline run over this tree produces categorized
transactions rather than a pile of uncategorized ones.

Two caveats on the `CreditCard` account specifically: `Golden1._fix_intraday_balance`
recomputes its running balance anchored to a hard-coded known-true balance on a
known date, because Golden1's exported intraday balances are not reliable. The
example's dates fall outside that anchor date, so the parser falls back to the
latest earlier date — fine for demonstrating the format, but the resulting
balances are not meaningful.

## Real data

The production tree lives at `Data/Banks/` and is git-ignored: budget maps and
CSVs there describe a real person's finances (employer, landlord, medical
providers, every merchant they visit). Keep it out of version control. `Data/`
is never read or written by the test suites — the unit tier uses fixtures under
`backend/apps/expense_tracker/tests/data/` and the E2E tier builds its own
scratch tree in `backend/.e2e/`.
