"""
Routes ORM traffic between the two schemas of the deployment's Postgres
database (two DATABASES aliases differing only by search_path):

- `default` (schema omniview): Django's own tables — auth, sessions, admin —
  plus the managed source-data models (rawdata.RawFile,
  budgets.BudgetMapDocument). Survives pipeline rebuilds; migrations run here.
- `datavault` (schema datavault): the dbt-built gold tables that the
  ExpenseTracker apps read via unmanaged models. The pipeline drops and
  recreates these tables on every rebuild, so nothing Django owns may live
  there and migrations must never run against it.

The split is by the model's `managed` flag, not per-app: an ExpenseTracker
app can hold both an unmanaged gold view (datavault) and a managed
source-data table (default), as budgets does.
"""

# Apps that contain unmanaged models over the dbt gold tables. Declared by each
# OmniView app (datavault_labels in its omniview_app.py), not listed here: the
# shell shouldn't have to be edited to add an app.
from shell.registry import DATAVAULT_APPS  # noqa: F401  (re-exported; tests import it from here)


class OmniViewDBRouter:
    @staticmethod
    def _alias_for(model):
        meta = model._meta
        if meta.app_label in DATAVAULT_APPS and not meta.managed:
            return "datavault"
        return "default"

    def db_for_read(self, model, **hints):
        return self._alias_for(model)

    def db_for_write(self, model, **hints):
        return self._alias_for(model)

    def allow_relation(self, obj1, obj2, **hints):
        # Cross-database relations don't exist here (expense models never FK
        # into auth and vice versa); let Django's default same-DB rule decide.
        return None

    def allow_migrate(self, db, app_label, **hints):
        # Everything migrates on default only. Unmanaged models produce
        # state-only migration operations (no DDL), so allowing whole apps
        # through on default is safe.
        return db != "datavault"
