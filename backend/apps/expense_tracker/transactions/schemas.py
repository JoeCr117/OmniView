from ninja import Schema


class AllTransactionOut(Schema):
    date_sk: int
    calendar_date: str
    account_type: str
    transaction_amount: float
    balance: float | None
    label: str | None
    category_sk: int | None


class BreakdownRow(Schema):
    """One transaction with its category names resolved, for the Breakdown page."""

    date_sk: int
    calendar_date: str
    account_type: str
    category: str
    sub_category: str
    label: str
    amount: float


class UncategorizedTransactionOut(Schema):
    date_sk: int
    account_type: str
    calendar_date: str
    transaction_description: str
    transaction_amount: float


class BudgetAnalysisRow(Schema):
    category: str
    sub_category: str
    category_budget: float | None
    sub_category_budget: float | None
    actual: float
