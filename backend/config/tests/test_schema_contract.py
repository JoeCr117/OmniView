"""The names Django is not free to change.

Django derives table names from an app's *label*, and the label defaults to the
last component of the app's package path. That makes both of them silently
sensitive to a package move - and three of these tables are not Django's alone
to rename:

- `budgets_budgetmapdocument` and `rawdata_rawfile` hold production data and are
  read with raw SQL by the pipeline (pipelines/expense_tracker/banks/source.py),
  which is not a Django process and cannot ask the ORM what the table is called.
- `adminportal_appaccess` holds every live per-user app grant.
- `omnierd_erdlayout` holds every user's saved diagram arrangement. Pinned from
  the start rather than retrofitted, since the cost of learning this the hard
  way is silently orphaning the lot.

Labels and db_tables are therefore pinned explicitly in the AppConfigs and model
Metas. This module is the tripwire: if a refactor moves a package and the name
follows it, these fail here instead of in production.
"""

from django.apps import apps

# label -> the dotted package path it currently lives at. The label is the
# contract; the path is free to change (that is the whole point of pinning).
EXPECTED_APP_LABELS = {
    'budgets': 'apps.expense_tracker.budgets',
    'rawdata': 'apps.expense_tracker.rawdata',
    'transactions': 'apps.expense_tracker.transactions',
    'dailymetrics': 'apps.expense_tracker.dailymetrics',
    'adminportal': 'apps.admin_portal',
    'omni_erd': 'apps.omni_erd',
    'shell': 'shell',
}

# (app_label, model_name) -> table name that must never move.
PINNED_TABLES = {
    ('budgets', 'BudgetMapDocument'): 'budgets_budgetmapdocument',
    ('rawdata', 'RawFile'): 'rawdata_rawfile',
    ('adminportal', 'AppAccess'): 'adminportal_appaccess',
    ('omni_erd', 'ErdLayout'): 'omnierd_erdlayout',
    ('omni_erd', 'ErdRelationshipOverride'): 'omnierd_relationshipoverride',
}


def test_app_labels_are_pinned():
    for label, package in EXPECTED_APP_LABELS.items():
        config = apps.get_app_config(label)
        assert config.name == package, (
            f'app {label!r} moved to {config.name!r}; update this test '
            f'(the *label* must stay {label!r} regardless)'
        )


def test_production_table_names_are_pinned():
    for (label, model_name), table in PINNED_TABLES.items():
        model = apps.get_model(label, model_name)
        assert model._meta.db_table == table


def test_pipeline_reads_the_tables_django_writes():
    """The raw SQL in the pipeline names these tables literally - keep in sync."""
    from apps.expense_tracker.budgets.models import BudgetMapDocument
    from apps.expense_tracker.rawdata.models import RawFile
    from pipelines.expense_tracker.banks.source import BUDGET_MAP_TABLE, RAW_FILE_TABLE

    assert BudgetMapDocument._meta.db_table == BUDGET_MAP_TABLE
    assert RawFile._meta.db_table == RAW_FILE_TABLE
