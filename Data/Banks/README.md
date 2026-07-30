# Data/Banks/

**Production data lives here, and none of it is in version control.**

This directory is the one-time import source: a real bank's CSV exports and the
budget map that categorizes them. Everything in it is git-ignored, because a
budget map's own category tree names an employer, a landlord, insurers, medical
providers, and every merchant its author visits. The app itself reads only the
database copies loaded from here, so this tree is a seed and a backup rather
than a live dependency.

The expected layout, one directory per bank:

```
Data/Banks/
└── <BankName>/
    ├── BudgetMap.yml       exactly ONE root .yml - the budget map
    └── <AccountName>/      one directory per account
        └── *.csv           that account's exported transactions
```

Load it with:

```
uv run python backend/manage.py import_banks_dir Data/Banks
```

[`docs/examples/Banks/`](../../docs/examples/Banks/) is a synthetic tree in
exactly this shape — fictional merchants, real column headers — and
[`docs/examples/README.md`](../../docs/examples/README.md) documents the format
in full. Use that to understand the input, and to test against, since the test
suites never read this directory.
