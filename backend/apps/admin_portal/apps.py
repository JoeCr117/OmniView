from django.apps import AppConfig


class AdminportalConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.admin_portal'
    # LOAD-BEARING - see budgets/apps.py. Stays 'adminportal' (not
    # 'admin_portal') even though the package moves to apps/admin_portal/:
    # renaming it would orphan this app's django_migrations rows and rename
    # adminportal_appaccess, which holds every live access grant.
    label = 'adminportal'
