from django.apps import AppConfig


class OmniErdConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.omni_erd'
    # LOAD-BEARING - see budgets/apps.py for the full reasoning. The label keys
    # this app's django_migrations rows and is what Django derives table names
    # from, so it must survive any package move. Pinned from day one rather
    # than retrofitted: `omnierd_erdlayout` holds every user's saved diagram
    # arrangement, and a silent rename would orphan the lot.
    # Asserted in config/tests/test_schema_contract.py.
    label = 'omni_erd'
