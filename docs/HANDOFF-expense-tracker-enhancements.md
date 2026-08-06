# Handoff — versioned Golden1 CSV parser

Branch `feature/expense-tracker-enhancements`, worktree
`W:\Projects\Claude Projects\OmniView-expense-tracker`.

This file is this branch's handoff only. The concurrent `feature/omni-erd-enhancements` branch owns
its own; `docs/HANDOFF.md` is the project's pre-existing current-state doc and is not this feature's.

## Goal

Golden1 changed its CSV export schema. The parser must detect a file's schema **from its header**,
conform it to the legacy 8-column shape **before** the per-account concatenation, drop
non-conforming columns, and let legacy and 2026 files coexist in one account without corrupting
money, direction or transaction ordering.

## Baselines

| Suite | At branch start | Now |
|---|---|---|
| `uv run pytest` (backend + pipelines, one command) | 318 passed | **399 passed** |
| `cd frontend && npm run test` | 246 passed | not re-run — this feature touches no frontend code |
| Playwright E2E | not run | **32 passed** |

Count history: 318 at branch start → 319 after E3 → 380 after E5 → 400 after E5b → 399 now. The
net −1 is deliberate: E6b deleted one strictly-weaker duplicate test and reshaped the schema-test
module.

Playwright E2E has been run serialized from this worktree and passed 32/32, requiring the compose `db` service and the shared port-8100 / `omniview_e2e` lock. The count (32) is the true current size; any earlier reference to 17 elsewhere in the project docs is stale.

## Milestones

| # | Milestone | Files | Agent | Status |
|---|-----------|-------|-------|--------|
| E1 | Schema declaration module: spec table, header detection, fail-loud errors, no pandas | `banks/all_banks/golden1_schema.py` (new) | implementer | done, verified |
| E2 | Per-file normalization before the concat; `Type` derivation; per-schema date parse; descending-file reversal; `kind='stable'` sort | `banks/all_banks/golden1.py` | implementer | done, verified |
| E3 | Test wiring: `testpaths` += pipelines, `norecursedirs`, tests package + README | `pyproject.toml`, `banks/tests/` | chore-runner | done, verified |
| E4 | Synthetic fixtures for both schemas, public tree | `docs/examples/Banks/Golden1/*/2026.csv` | feature-dev | done, verified |
| E5 | Test suite, first pass: 61 pipeline tests over schema detection, single-file normalization, ordering and whole-account parsing | `banks/tests/test_*.py` | test-engineer | done, verified — 380 |
| E5b | Closed the untested fail-loud and error-message-redaction branches | `banks/tests/test_*.py` | test-engineer | done, verified — 400 |
| E5c | Root-cause of the adjacent `_map_categories` finding; diagnosis only, no edit | — | debugger | done — see "Findings that outlived the design phase" |
| E6 | Review sweep, **serialized one agent at a time, read-only**: code-reviewer → standards-auditor → readability-judge → security-auditor | changed files | four reviewers | done — all four returned, no blocking findings |
| E6a | Accepted production fixes from the sweep | `golden1_schema.py`, `golden1.py` | implementer | done, verified |
| E6b | Accepted test fixes from the sweep | `banks/tests/` | test-engineer | done, verified — 399 |
| E6c | Docstring/comment chore | changed files | chore-runner | done, verified |
| E7 | Docs: package READMEs, examples README, `adding-a-bank` skill, this file | docs | doc-writer | done |

Nothing is committed. `master..HEAD` is empty; the user makes the commit. Working tree:
`M golden1.py`, `M pyproject.toml`, `M uv.lock`, and untracked `golden1_schema.py`,
`banks/tests/` (`conftest.py`, `__init__.py`, `README.md`, four `test_golden1_*.py`), four
`docs/examples/Banks/Golden1/*/2026.csv` fixtures, and this file.

## The two schemas

Legacy (v1, 2024/2025, all four accounts):
`"Date","ReferenceNo.","Type","Description","Debit","Credit","CheckNumber","Balance"`

New (v2, 2026, all four accounts, identical across them):
`"Date","Account","Account Type","Description","Check #","Category","Credit","Debit","Daily Balance"`

Mapping: `Date`→`Date`, `Description`→`Description`, `Check #`→`CheckNumber`,
`Daily Balance`→`Balance`, `Credit`→`Credit`, `Debit`→`Debit`. `Type` is **derived**.
`ReferenceNo.` has **no source**. `Account`, `Account Type` and `Category` are **dropped**.

## Decisions made, and why

- **Conform to the legacy shape, not to a new canonical one.** The four `bronze_Golden1_*.sql`
  models select the legacy column names literally. Conforming upstream is what makes this a
  pipeline-only change with zero dbt, backend or frontend edits.
- **`Account Type` must never map to `Type`.** v2's `Account Type` is the account KIND
  (Checking / Credit Card); legacy `Type` is the transaction DIRECTION. Near-identical names,
  unrelated meaning. `Type` is derived instead from which of Debit/Credit is populated.
- **Every column is resolved by header name, never positionally.** The money columns are
  order-inverted between versions (v1 `Debit,Credit`; v2 `Credit,Debit`). A positional read swaps
  every debit and credit and still passes a shape test.
- **Schema declarations live with Golden1, not on the `Bank` ABC.** Putting them on `Bank` would
  abstract over *banks*, and there is exactly one. Two schemas of one bank is not the third
  occurrence. Revisit only when a second bank independently needs schema versioning; the trigger is
  recorded in the module docstring.
- **Detection is exact set-equality on normalized header names.** Order must not be load-bearing
  for matching, because the whole v1→v2 change proves order is a lie. Subset matching was rejected:
  it would let v1 match a future v3 that merely adds a column, silently dropping it.
- **Drop-by-omission, not a blacklist.** Columns never named as a source simply never enter the
  frame, so a future unknown column cannot leak through.
- **Unrecognized header fails loud** (`UnknownCsvSchemaError(ValueError)`), before any parsing.
  `main.py` constructs every `Bank` before calling any `to_sql`, so a failure during construction
  means nothing was staged at all and the previous good build still stands.
- **`Type` derivation uses `notna()`, never truthiness.** A `$0.00` fee is falsy but *present* and
  is correctly a DEBIT. Neither side populated → `None` (no direction is the honest answer). Both
  populated → raise, because that is the exact signature of a mis-mapped Credit/Debit inversion.
- **`ReferenceNo.` for v2 rows is `numpy.nan` in a float64 column** — byte-identical to how a blank
  legacy `ReferenceNo.` already flows to SQL NULL. An empty string or object column would flip the
  staged column to TEXT and make every legacy value render as `'2000000001.0'` in bronze.
- **Dates parse with an explicit per-schema format and `errors='raise'`.** An explicit format
  removes `dayfirst` ambiguity entirely. Under the old code the inference happened once over the
  *concatenated* frame, so one file's first row could decide another file's interpretation.
- **`SourceSchema` is staged as provenance.** Bronze's projection is an explicit column list, so it
  never reaches bronze; it makes any year-to-year inconsistency explainable later.

## Error-message rule (security)

Pipeline stdout and stderr are returned to the browser of whoever pressed Rebuild, and one added
logger call in `backend/shell/pipeline.py` would make them durable under `omniview.*`; the rows are
a real person's finances. Exceptions may carry: bank/account/filename, counts, zero-based row
ordinals, schema version names. They must never carry a cell value, a slice of the CSV text, a
DataFrame repr, or a chained pandas message that embeds a value. The rule binds the warnings these
modules `print` exactly as it binds what they raise.

**Row-1 names are allowlisted by declaration, not by shape.** E6a replaced the private
`_looks_like_header` heuristic ("does row 1 look like a header?") with `_DECLARED_HEADER_NAMES` — a
mapping of every column name any declared schema exports, keyed by its normalized form — read
through `_declared_names_clause`. A row-1 name is echoed only when some declared schema exports it,
and it is echoed as this module's own constant rather than as the file's text; everything else is
counted and never shown. This is strictly stronger than the heuristic: every caller reaches the
clause having already disproved "row 1 is a header", so row 1 may be any line of any file — a memo,
a payee list, a `.txt` renamed `.csv` — which is text a shape heuristic cannot bound.

## Findings that outlived the design phase

- **Pre-existing bug, being fixed here.** `_fix_intraday_balance` calls `df.sort_values('Date')`,
  whose pandas default `kind='quicksort'` is not stable. Verified first-hand on pandas 2.3.1: on an
  already-correctly-ordered 1200-row / 300-date frame, quicksort scrambled ties on **140 of 300**
  dates; `kind='stable'` scrambled none. This silently reorders same-day CreditCard transactions and
  bakes the scramble into `Indx`, the column whose stated purpose is preserving transaction order.
  Blast radius is bounded: end-of-day balances and every Daily Metric are provably unaffected,
  because both the anchor and `silver_Golden1_DailyBalances`' `MAX(TransactionIndex)` depend on the
  day's *last* row, which is permutation-invariant. What is wrong today is the per-transaction
  `Balance` on non-last rows of a multi-transaction day.
- **The anchor `('2025-07-12', 1749.18)` still holds and must not be changed.** With `Cₖ` the cumsum
  and `p` the anchor date's last row, `adjustment = B* − C_p` and `Balanceₖ = B* + (Cₖ − C_p)`.
  Appending 2026 rows (all k > p) changes neither `p` nor `C_p`, so every pre-2026 balance stays
  bit-identical. A test asserts this element-wise.
- **`TransactionType` is consumed by nothing.** Produced in the four bronze models; silver and gold
  use explicit projections that exclude it, no Django field or frontend reference exists, and
  categorization matches on `Description` alone. This is why the `Type` vocabulary question below is
  a latent reporting hazard rather than a live bug.
- **Two corrections to the original brief, both verified.** (1) The `docs/examples` CSVs are *not*
  1-byte stubs — they hold legacy-schema sample rows, so E4 adds `2026.csv` files rather than
  populating `2024.csv`. (2) `errors='coerce'` followed by `.astype(int)` does not produce garbage;
  it already raises `ValueError: cannot convert float NaN to integer` — just opaquely, after the
  concat has erased which file was at fault.
- **`pyproject.toml` has `testpaths = ["backend"]`.** Tests placed under `pipelines/` are not
  collected until that is extended (E3). `pythonpath` already includes `"."`, so the imports resolve.
- **`Data/` in this worktree contains only a tracked `Banks/README.md`** — no production CSVs.
  Verified before any agent was dispatched near it.
- **E5c: `Bank._map_categories`' NaN-description `AttributeError` does not block this feature, and
  stays out of scope.** It calls `row['Description'].upper()`, which raises on a NaN description. A
  debugger root-caused it: the behavior is **pre-existing**, it is **fail-loud**, and it **stages
  nothing** — every `Bank` is constructed before any `to_sql`, so a failure during construction
  leaves the previous good build standing. Its traceback **carries no cell value**, so it does not
  breach the error-message rule either. It lives in `bank.py`, which this feature does not touch.
- **E6a's accepted fixes.** Production edits from the review sweep, applied to `golden1_schema.py`
  and `golden1.py`. One item superseded its brief: the redaction fix was scoped as a tightening of
  the `_looks_like_header` heuristic and instead **replaced** it with the declaration-based
  allowlist described under "Error-message rule (security)". `_looks_like_header` no longer exists.

## Landed so far

- **E1 `banks/all_banks/golden1_schema.py`** — `Golden1CsvSchema` frozen dataclass, the
  `GOLDEN1_CSV_SCHEMAS` table (v1 + v2), `ColumnSource` tagged union (`str | Derived | Absent`),
  `detect_schema` on exact set-equality of normalized header names, plus
  `UnknownCsvSchemaError` / `AmbiguousCsvSchemaError`. Imports no pandas or numpy, so the table is
  testable as pure data. `sources` mappings are wrapped in `MappingProxyType` so a module-level
  constant is not mutable global state.
- **E2 `banks/all_banks/golden1.py`** — `_normalize_file` conforms one file at a time, building the
  frame column-by-column by name out of `spec.sources`. `_derive_transaction_direction`,
  `_parse_dates`, `_to_oldest_first` and `_absent_column` are module-level pure functions.
  `_reject_undeclared_schemas` does a header-only pass over every file in an account before any
  frame is built, so a bad file is named before megabytes are parsed. `_fix_intraday_balance` now
  sorts with `kind='stable'`; its body is otherwise unchanged and the anchor is untouched.
- **E3 test wiring** — `testpaths = ["backend", "pipelines"]` plus a `norecursedirs` that restates
  pytest's defaults alongside dbt's generated output. `numpy` promoted to an explicit dependency
  (`golden1.py` imports it directly; it previously resolved only transitively through pandas). The
  `uv.lock` diff is exactly two lines and changes no version.
- **E4 fixtures** — `docs/examples/Banks/Golden1/{CreditCard,FreeChecking,MoneyMarket,Savings}/2026.csv`,
  all in the v2 schema: descending rows, `Credit` before `Debit`, negative debits, zero-padded
  dates. CreditCard carries a date with three transactions (the intraday-ordering path);
  FreeChecking carries a populated `Check #` and one row with neither money column populated.
  Every value is invented — the repo is public.

## Implementation notes worth keeping

- **`pd.Series(None, index=..., dtype='object')` silently yields NaN, not `None`,** on pandas 2.3.1
  — pandas coerces a scalar `None` even in an object column. A float NaN staged into a TEXT column
  is not the SQL NULL a directionless row needs. `np.full(n, None, dtype='object')` is what
  actually produces Python `None`.
- **`errors='raise'` does not catch a blank date.** Pandas treats an empty cell as missing rather
  than malformed, so the parse succeeds and the NaT would survive to the opaque `.astype('int64')`
  failure. `_parse_dates` therefore checks `parsed.isna().any()` after the parse and reports blanks
  through the same positional message.
- **Equal consecutive dates count as valid descending order.** Rows sharing a date carry no time
  information, so their file order is the only evidence of their order, and reversing it is the
  correct reading of "newest first".

## Local stack verification (2026-08-05)

Stack rebuilt and running from this worktree on `http://127.0.0.1:8010`; `omniview-pgdata` volume preserved.

Test results: `uv run pytest` **399**, `npm run test` **246** (29 files), `npm run e2e` **32** (first run on branch).

Local `omniview` database holds v1 legacy CSVs only — 8 rows in `rawdata_rawfile` from `Golden1/{CreditCard,FreeChecking,MoneyMarket,Savings}/{2024,2025}.csv`, all carrying v1 headers. The v2 path has no real-data exercise locally; only synthetic fixtures under `docs/examples/` are in the v2 schema.

`datavault` holds 22 relations; `gold_Golden1_BudgetAnalysis` is absent and has never been built.

A Rebuild will run `tests/Budgets/CatToSubCatSums.sql` for the first time and is expected to FAIL due to a genuine subcategory-over-budget violation in the live BudgetMap. Because `datavault` drops and recreates on every rebuild, a failed rebuild leaves it incomplete. Recovery: fix the budget map in the UI and rebuild.

## Open questions (flagged, not guessed)

Questions 1 and 3 remain unverifiable without `Data/`; question 2 remains open but is repairable
later.

1. **OPEN — Intra-date ordering inside real 2026 files.** They are descending by date. Whether transactions
   *within* a date are also newest-first is unverifiable without `Data/`, and a whole-file reverse
   assumes they are. The monotonicity assertion catches only the date-level half. Worth eyeballing
   one real 2026 multi-transaction day and recording the answer in the schema docstring.
2. **OPEN — The legacy `Type` vocabulary.** The brief reports the real files hold `DEBIT`/`CREDIT`; the
   tracked synthetic fixtures hold `PURCHASE`/`ACH`/`DEPOSIT`/… The implementation emits
   `DEBIT`/`CREDIT` for derived rows, which is correct under the first reading and merely *coarser*
   under the second — never wrong, and the only thing derivable, since v2 has no transaction-kind
   column. `SourceSchema` is staged per row, so which files carried which vocabulary stays
   recoverable and the difference can be repaired later without a re-import.
3. **OPEN — Whether every real `ReferenceNo.` is numeric.** If so, pandas' nullable `Int64` would
   also pin the staged column type at `bigint`. Not adopted, because a non-numeric value would make
   `read_csv` raise where today it degrades gracefully.

## Known test-coverage gaps

Both were flagged by the test-engineer and accepted as non-blocking.

- **`AmbiguousCsvSchemaError`'s redaction is not asserted.** Its message runs the same
  `_declared_names_clause` as `UnknownCsvSchemaError`, whose redaction *is* asserted, but the
  ambiguous branch is only reachable by monkeypatching a clone into `GOLDEN1_CSV_SCHEMAS` — the
  declared table cannot produce it.
- **The allowlist is never exercised with a name declared by exactly one version** (e.g. v1-only
  `CheckNumber`). Nothing therefore proves `_DECLARED_HEADER_NAMES` is the *union* of both schemas'
  names rather than their intersection.

## Deliberately deferred

- **Exploiting v2's `Category` column against the BudgetMap.** The bank's own categories
  (`Income/Payroll`, `Utilities/Phone`) overlap conceptually with the BudgetMap, but the column is
  dropped as instructed. Note the trap if it is ever adopted: `Bank._map_categories` merges against
  a `transaction_map` that also has a `Category` column, so an un-dropped `Category` would produce
  `Category_x`/`Category_y` and both would survive into the staged table.
- **Playwright E2E.** Not parallel-safe: port 8100 is hardcoded with `reuseExistingServer` off and
  the `omniview_e2e` database is shared with the concurrent worktree. Has been run once serialized
  from this worktree and passed 32/32.

## How to resume cold

1. Read this file, then `pipelines/expense_tracker/banks/all_banks/golden1_schema.py`.
2. `cd "W:\Projects\Claude Projects\OmniView-expense-tracker"; uv run pytest -q` — expect 399.
3. Every milestone is done. What is left is the user's commit.
