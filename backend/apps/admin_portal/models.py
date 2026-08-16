from django.conf import settings
from django.db import models

# App ids an admin can grant to users: every registered app that isn't
# admin_only (the Admin Portal is staff-gated by shell.security.AdminAuth, so it
# is never granted). Derived, not maintained - a new app becomes grantable by
# registering, not by editing this file.
from shell.registry import (
    GRANTABLE_APP_IDS,  # noqa: F401  (re-exported; api/schemas import it here)
)


class AppAccess(models.Model):
    """One user's grant to one OmniView dashboard app.

    Access is deny-by-default: a non-staff user only sees/uses apps they have
    a row for (enforced API-side by shell.security.AppAccessAuth and
    cosmetically by the frontend registry filter). Staff bypass entirely.
    Lives in the `default` database (omniview schema) and survives pipeline
    rebuilds.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='app_access'
    )
    app_id = models.CharField(max_length=100)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+'
    )
    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Pinned, not derived: this table holds every live access grant, and
        # the package moves to apps/admin_portal/ without the label following.
        db_table = 'adminportal_appaccess'
        constraints = [
            models.UniqueConstraint(fields=['user', 'app_id'], name='unique_app_access_per_user'),
        ]
        ordering = ['user_id', 'app_id']
        verbose_name_plural = 'app accesses'

    def __str__(self) -> str:
        return f'{self.user_id}:{self.app_id}'
