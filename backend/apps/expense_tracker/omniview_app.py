"""ExpenseTracker's declaration to the OmniView shell."""

from shell.appspec import OmniViewApp

APP = OmniViewApp(
    id='expense-tracker',
    router='apps.expense_tracker.api.router',
    django_apps=(
        'apps.expense_tracker.transactions',
        'apps.expense_tracker.budgets',
        'apps.expense_tracker.dailymetrics',
        'apps.expense_tracker.rawdata',
    ),
    # budgets and rawdata own managed source tables *as well*, so this is a
    # label set rather than an app split - the router keys off each model's
    # `managed` flag within these labels.
    datavault_labels=frozenset({'transactions', 'budgets', 'dailymetrics', 'rawdata'}),
    # The URLs this app had before OmniView existed (bookmarks, and muscle
    # memory from the Power BI era). 'api-docs' was one of these and now
    # belongs to the Admin Portal - the page documents the whole OmniView API,
    # not this app's slice of it.
    legacy_pages=(
        'check-book',
        'daily-trends',
        'uncategorized',
        'budget-map',
        'raw-csvs',
    ),
)
