"""
Pure unit tests for the two-schema router: unmanaged models in the expense
apps read the dbt gold tables via `datavault`; managed models (Django's own
tables + the source-data models) stay on `default`; migrations may never
touch `datavault` (the pipeline drops and recreates its tables on every
rebuild).
"""

from django.contrib.auth.models import User
from django.contrib.sessions.models import Session

from apps.expense_tracker.budgets.models import BudgetMap, BudgetMapDocument
from config.db_router import DATAVAULT_APPS, OmniViewDBRouter
from apps.expense_tracker.dailymetrics.models import DailyMetric
from apps.expense_tracker.rawdata.models import RawFile
from apps.expense_tracker.transactions.models import AllTransaction

router = OmniViewDBRouter()


def test_datavault_apps_cover_the_expense_tracker_apps():
    assert DATAVAULT_APPS == {'dailymetrics', 'transactions', 'budgets', 'rawdata'}


def test_unmanaged_expense_models_read_and_write_datavault():
    for model in (DailyMetric, AllTransaction, BudgetMap):
        assert router.db_for_read(model) == 'datavault'
        assert router.db_for_write(model) == 'datavault'


def test_managed_source_data_models_stay_on_default():
    # Same apps as the gold views, but managed - they hold the editable
    # source data that must survive pipeline rebuilds.
    for model in (RawFile, BudgetMapDocument):
        assert router.db_for_read(model) == 'default'
        assert router.db_for_write(model) == 'default'


def test_django_models_stay_on_default():
    for model in (User, Session):
        assert router.db_for_read(model) == 'default'
        assert router.db_for_write(model) == 'default'


def test_nothing_ever_migrates_on_datavault():
    for app_label in ('auth', 'sessions', 'dailymetrics', 'core', 'budgets', 'rawdata'):
        assert router.allow_migrate('datavault', app_label) is False


def test_all_apps_migrate_on_default():
    # Expense apps included: their unmanaged models produce state-only
    # operations, and their managed models need real tables.
    for app_label in ('auth', 'sessions', 'admin', 'contenttypes', 'core', 'budgets', 'rawdata'):
        assert router.allow_migrate('default', app_label) is True
