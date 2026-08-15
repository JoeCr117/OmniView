from django.db import models


class AllTransaction(models.Model):
    """Unmanaged read-only model over the gold_Golden1_AllTransactions dbt view.

    This view is a UNION ALL across four account tables and has no natural
    unique key. date_sk is declared as the Django "primary key" purely to
    satisfy the ORM's requirement that every model have one; it is NOT
    actually unique (many transactions share a date). This is safe for the
    list/filter-only read patterns used here - avoid .get(pk=...) on this
    model, since multiple rows can share a date_sk.
    """

    date_sk = models.IntegerField(db_column='datesk', primary_key=True)
    calendar_date = models.CharField(db_column='calendardate', max_length=10)
    account_type = models.TextField(db_column='accounttype')
    transaction_amount = models.FloatField(db_column='transactionamount')
    balance = models.FloatField(db_column='balance', null=True)
    label = models.TextField(db_column='label', null=True)
    category_sk = models.IntegerField(db_column='categorysk', null=True)

    class Meta:
        managed = False
        db_table = 'gold_Golden1_AllTransactions'
        ordering = ['-date_sk']


class UncategorizedTransaction(models.Model):
    """Unmanaged read-only model over gold_Golden1_UncategorizedTransactions.

    Same no-natural-unique-key caveat as AllTransaction above.
    """

    date_sk = models.IntegerField(db_column='datesk', primary_key=True)
    account_type = models.TextField(db_column='accounttype')
    calendar_date = models.CharField(db_column='calendardate', max_length=10)
    transaction_description = models.TextField(db_column='transactiondescription')
    transaction_amount = models.FloatField(db_column='transactionamount')

    class Meta:
        managed = False
        db_table = 'gold_Golden1_UncategorizedTransactions'
        ordering = ['-date_sk']
