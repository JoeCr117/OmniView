"""ExpenseTracker: budgets, balances and spending analytics over bank CSVs.

Four Django apps, split by the tables they own rather than by feature:
rawdata (uploaded CSVs) and budgets (the budget map) are the managed source
data; transactions and dailymetrics are unmanaged reads over the dbt gold
views. Their labels are pinned and must not change - see budgets/apps.py.

The ETL that fills those gold views lives outside the web layer, in
pipelines/expense_tracker/.
"""
