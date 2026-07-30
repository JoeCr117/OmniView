from django.apps import AppConfig


class BudgetsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.expense_tracker.budgets'
    # LOAD-BEARING. The label keys this app's django_migrations rows and is
    # what Django derives table names from, so it must survive any package
    # move. Pinned explicitly (rather than defaulted from `name`) so relocating
    # this package can never silently rename budgets_budgetmapdocument - a
    # table that holds production data and is read by raw SQL in the pipeline
    # (pipelines/expense_tracker/banks/source.py). Asserted in
    # apps/expense_tracker/tests/test_schema_contract.py.
    label = 'budgets'
