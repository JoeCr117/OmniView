from django.db.models import Sum

from apps.expense_tracker.budgets.models import BudgetMap
from .models import AllTransaction


def budget_analysis(start: str | None = None, end: str | None = None) -> list[dict]:
    """
    Compute budget-vs-actual per (Category, SubCategory).

    Deliberately computed here rather than read from the gold_Golden1_BudgetAnalysis
    view, which aggregates over all history: this endpoint takes an optional
    start/end window, and a pre-aggregated view cannot be re-sliced by date.
    The two are meant to agree when called with no window - the gold view is
    for BI/SQL consumers, this is the interactive path.

    NOTE on sign convention (inherited from the dbt layer, not introduced here):
    gold_Golden1_AllTransactions.TransactionAmount is
    negated for CreditCard rows (silver_Golden1_CreditCard: (Debit+Credit)*-1)
    but NOT for FreeChecking/MoneyMarket/Savings rows, i.e. the same "$50
    purchase" nets to -50 if paid by credit card but +50 if paid by debit
    card/check, purely due to how the existing (frozen) dbt layer models each
    account type. There is no reliable way to normalize this into a single
    "spend is always positive" number from TransactionAmount alone (the raw
    Debit/Credit columns aren't carried through to this gold view). This
    endpoint therefore reports the raw signed SUM(TransactionAmount) as-is;
    treat the sign as "this account type's convention", not "spend vs.
    income", until/unless the upstream gold_Golden1_BudgetAnalysis model is
    implemented with a normalized sign.
    """
    qs = AllTransaction.objects.exclude(category_sk__isnull=True)
    if start:
        qs = qs.filter(calendar_date__gte=start)
    if end:
        qs = qs.filter(calendar_date__lte=end)

    actuals = {
        row["category_sk"]: row["total"]
        for row in qs.values("category_sk").annotate(total=Sum("transaction_amount"))
    }

    rows = []
    for budget in BudgetMap.objects.all():
        rows.append({
            "category": budget.category,
            "sub_category": budget.sub_category,
            "category_budget": budget.category_budget,
            "sub_category_budget": budget.sub_category_budget,
            "actual": actuals.get(budget.category_sk, 0.0),
        })
    return rows
