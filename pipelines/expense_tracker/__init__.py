"""ExpenseTracker's ETL: bank CSV exports -> categorized, budgeted gold tables.

`banks/` parses each bank's raw CSVs and budget map and stages them into the
datavault schema; `dbt/` builds bronze -> silver -> gold on top of that;
`main.py` is the entry point that runs both.
"""
