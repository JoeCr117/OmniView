from django.conf import settings
from django.db import models
from django.db.models import F, Q


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


class ErdRelationshipOverride(models.Model):
    """One admin's standing assertion about one pair of entities: join, or don't.

    Managed, so `config/db_router.py` routes it to `default` -> the `omniview`
    schema. It must never live in `datavault`: a pipeline rebuild drops that
    schema wholesale, and an override is knowledge about the schema that has to
    outlive the warehouse it describes.

    Global rather than per-user, unlike `ErdLayout`. A layout has no truth
    value - two people can both be right about where a box belongs - while an
    override asserts a fact about the schema, and the SELECT generated from it
    must be the same query for everyone. That is precisely why writing one takes
    admin privilege.

    The pair is stored canonically with `entity_a < entity_b`, so (A, B) and
    (B, A) are the same row under a plain unique constraint instead of a
    functional index - and a self-pair becomes unrepresentable for free. The
    direction inference needs lives in `many_side` alone, which is what lets the
    service layer rebuild the IR's `source`/`target` ends from an unordered row.
    """

    ACTION_CHOICES = [('join', 'Join'), ('suppress', 'Suppress')]
    MANY_SIDE_CHOICES = [('a', 'entity_a'), ('b', 'entity_b')]

    #: An id from sources.py, e.g. 'pg-datavault'.
    source_id = models.CharField(max_length=100)
    #: The schema within that source.
    namespace = models.CharField(max_length=200)
    #: Entity ids ("<namespace>.<name>"). 300 rather than Postgres' 127-char
    #: ceiling (63 + '.' + 63) to leave room for Unity Catalog's three-part names.
    #: Collated `C` because `erd_override_pair_is_ordered` below re-derives in SQL
    #: the ordering `services.canonical_pair` decides in Python: glibc's en_US.utf8
    #: reads 'x_Bank' > 'x_account' where Python reads the reverse, so the row
    #: Python ordered correctly is rejected. `C` is byte order - what Python's `<`
    #: compares. Changing it means changing `canonical_pair` to match.
    entity_a = models.CharField(max_length=300, db_collation='C')
    entity_b = models.CharField(max_length=300, db_collation='C')
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    #: Positionally paired to form a composite join; both empty when suppressing.
    columns_a = models.JSONField(default=list)
    columns_b = models.JSONField(default=list)
    #: Which end of the canonical pair is the referencing (many) side.
    many_side = models.CharField(max_length=1, choices=MANY_SIDE_CHOICES, default='a')
    cardinality = models.CharField(max_length=20, default='many_to_one')
    #: The admin's justification; surfaces in the edge tooltip.
    note = models.CharField(max_length=500, blank=True, default='')
    # SET_NULL, mirroring AppAccess.granted_by: deleting a user must never
    # delete schema knowledge. Nullable is also required outright because
    # OMNIVIEW_AUTH_REQUIRED=0 is a supported mode, and an AnonymousUser cannot
    # be a foreign key.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+'
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # An override is editable, unlike a grant, so it carries both timestamps.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Pinned, not derived - see apps.py. The package may move; this may not.
        db_table = 'omnierd_relationshipoverride'
        constraints = [
            models.UniqueConstraint(
                fields=['source_id', 'namespace', 'entity_a', 'entity_b'],
                name='unique_erd_relationship_override',
            ),
            models.CheckConstraint(
                condition=Q(entity_a__lt=F('entity_b')),
                name='erd_override_pair_is_ordered',
            ),
        ]
        ordering = ['source_id', 'namespace', 'entity_a', 'entity_b']

    def __str__(self) -> str:
        return f'{self.source_id}:{self.namespace}:{self.entity_a}~{self.entity_b}'
