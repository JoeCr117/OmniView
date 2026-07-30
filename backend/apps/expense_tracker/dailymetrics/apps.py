from django.apps import AppConfig


class DailymetricsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.expense_tracker.dailymetrics'
    # LOAD-BEARING - see budgets/apps.py.
    label = 'dailymetrics'
