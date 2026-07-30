from django.apps import AppConfig


class TransactionsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.expense_tracker.transactions'
    # LOAD-BEARING - see budgets/apps.py. This app's models are all unmanaged
    # (dbt gold views), but the label still keys its django_migrations rows and
    # the datavault routing set (shell/registry.py).
    label = 'transactions'
