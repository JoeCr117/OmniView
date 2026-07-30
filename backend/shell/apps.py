from django.apps import AppConfig


class ShellConfig(AppConfig):
    """OmniView shell concerns: auth API, log ingestion, auth-signal logging.

    Holds no models, which is why this one *could* be renamed (core -> shell)
    without the migration/table consequences documented in
    apps/expense_tracker/budgets/apps.py.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "shell"
    label = "shell"

    def ready(self) -> None:
        from shell import signals  # noqa: F401  (connects auth-signal receivers)
