from django.db import models


class DailyMetric(models.Model):
    """Unmanaged read-only model over the gold_Golden1_DailyMetrics dbt view.

    DateSK is one row per calendar date (joined from gold_DimDate), so it is
    safe to use as the Django ORM primary key even though the underlying view
    doesn't declare one.
    """

    date_sk = models.IntegerField(db_column='datesk', primary_key=True)
    calendar_date = models.CharField(db_column='calendardate', max_length=10)
    credit_card_transaction_total = models.FloatField(
        db_column='creditcardtransactiontotal', null=True
    )
    credit_card_balance = models.FloatField(db_column='creditcardbalance', null=True)
    free_checking_transaction_total = models.FloatField(
        db_column='freecheckingtransactiontotal', null=True
    )
    free_checking_balance = models.FloatField(db_column='freecheckingbalance', null=True)
    money_market_transaction_total = models.FloatField(
        db_column='moneymarkettransactiontotal', null=True
    )
    money_market_balance = models.FloatField(db_column='moneymarketbalance', null=True)
    savings_transaction_total = models.FloatField(db_column='savingstransactiontotal', null=True)
    savings_balance = models.FloatField(db_column='savingsbalance', null=True)
    transaction_total = models.FloatField(db_column='transactiontotal', null=True)
    total_balance = models.FloatField(db_column='totalbalance', null=True)
    no_transactions_flag = models.IntegerField(db_column='notransactionsflag', null=True)

    class Meta:
        managed = False
        db_table = 'gold_Golden1_DailyMetrics'
        ordering = ['date_sk']
