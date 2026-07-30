from ninja import Schema


class DailyMetricOut(Schema):
    date_sk: int
    calendar_date: str
    credit_card_transaction_total: float | None
    credit_card_balance: float | None
    free_checking_transaction_total: float | None
    free_checking_balance: float | None
    money_market_transaction_total: float | None
    money_market_balance: float | None
    savings_transaction_total: float | None
    savings_balance: float | None
    transaction_total: float | None
    total_balance: float | None
    no_transactions_flag: int | None
