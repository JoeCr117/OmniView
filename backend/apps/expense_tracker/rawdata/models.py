from django.db import models


class RawFile(models.Model):
    """One raw bank CSV export, stored as decoded UTF-8 text.

    Replaces the old Data/Banks/<bank>/<account>/*.csv layout as the
    pipeline's transaction source. Lives in the `default` database (omniview
    schema) so uploads survive pipeline rebuilds.
    """

    bank = models.CharField(max_length=100)
    account = models.CharField(max_length=100)
    filename = models.CharField(max_length=255)
    content = models.TextField()
    # Byte length of the original upload (content is stored decoded).
    size = models.PositiveIntegerField()
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Pinned, not derived - see budgets.BudgetMapDocument. The pipeline
        # reads this table with raw SQL
        # (pipelines/expense_tracker/banks/source.py) and it holds production
        # data, so the name must not follow the app label or package around.
        db_table = 'rawdata_rawfile'
        constraints = [
            models.UniqueConstraint(
                fields=['bank', 'account', 'filename'],
                name='unique_rawfile_per_account',
            ),
        ]
        ordering = ['bank', 'account', 'filename']

    def __str__(self) -> str:
        return f'{self.bank}/{self.account}/{self.filename}'
