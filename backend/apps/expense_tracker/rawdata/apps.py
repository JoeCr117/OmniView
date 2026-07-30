from django.apps import AppConfig


class RawdataConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.expense_tracker.rawdata'
    # LOAD-BEARING - see budgets/apps.py. Pinned so a package move can never
    # rename rawdata_rawfile, which holds production data and is read by raw
    # SQL in pipelines/expense_tracker/banks/source.py.
    label = 'rawdata'
