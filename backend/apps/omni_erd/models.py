from django.conf import settings
from django.db import models


class ErdLayout(models.Model):
    """Where one user dragged the tables of one diagram.

    Managed, so `config/db_router.py` routes it to `default` -> the `omniview`
    schema, alongside auth and the source data. It must not live in `datavault`:
    a pipeline rebuild drops that schema wholesale, and losing a saved layout
    because the warehouse rebuilt would be indefensible.

    Positions are keyed by `Entity.id` ("<namespace>.<name>"), which is stable
    across captures - so a layout survives a schema refresh, and entities that
    disappear simply leave stale keys that the frontend ignores. Per-user
    rather than shared: two people looking at the same schema want their own
    arrangement, and nothing here is worth a permissions model.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='erd_layouts'
    )
    #: An id from sources.py, e.g. 'pg-datavault'.
    source_id = models.CharField(max_length=100)
    #: The schema within that source.
    namespace = models.CharField(max_length=200)
    #: {entity_id: {"x": float, "y": float}}
    positions = models.JSONField(default=dict)
    #: {"global": ColumnMode, "overrides": {entity_id: ColumnMode}} - how much of
    #: each table the card shows. Stored beside the positions rather than
    #: separately because the two are only meaningful together: a saved position
    #: was chosen at a particular card *height*, so restoring coordinates while
    #: resetting every card to expanded would hand back an overlapping diagram.
    view_state = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Pinned, not derived - see apps.py. The package may move; this may not.
        db_table = 'omnierd_erdlayout'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'source_id', 'namespace'], name='unique_erd_layout'
            ),
        ]
        ordering = ['user_id', 'source_id', 'namespace']

    def __str__(self) -> str:
        return f'{self.user_id}:{self.source_id}:{self.namespace}'
