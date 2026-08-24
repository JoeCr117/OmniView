from django.db.models import Sum

from apps.expense_tracker.budgets.models import BudgetMap

from .models import AllTransaction

UNCATEGORIZED = 'Uncategorized'

_BREAKDOWN_FIELDS = (
    'date_sk',
    'calendar_date',
    'account_type',
    'label',
    'transaction_amount',
    'category_sk',
)


def _category_names() -> dict[int, tuple[str, str]]:
    """Every CategorySK mapped to its (Category, SubCategory) pair."""
    return {
        row['category_sk']: (row['category'], row['sub_category'])
        for row in BudgetMap.objects.values('category_sk', 'category', 'sub_category')
    }


def _named(row: dict, names: dict[int, tuple[str, str]]) -> dict:
    category, sub_category = names.get(row['category_sk'], (UNCATEGORIZED, UNCATEGORIZED))
    return {
        'date_sk': row['date_sk'],
        'calendar_date': row['calendar_date'],
        'account_type': row['account_type'],
        'category': category,
        'sub_category': sub_category,
        'label': row['label'] or UNCATEGORIZED,
        'amount': row['transaction_amount'],
    }


def breakdown_rows(start: str | None = None, end: str | None = None) -> list[dict]:
    """
    Every transaction, with its Category/SubCategory names resolved.

    The Breakdown page pivots, drills and cross-filters this one payload
    client-side (the same trade Check Book makes with DailyMetrics), so the whole
    window ships in one response rather than one aggregate per interaction.

    The names come from a second query joined in Python, not a SQL join: gold
    carries no foreign keys (dbt builds by CTAS), the two relations are separate
    unmanaged models, and the dimension is ~30 rows. This is the same shape as
    budget_analysis above.

    Rows whose CategorySK matches no BudgetMap entry - and rows the pipeline
    never labelled - are reported as "Uncategorized" rather than dropped, so a
    total over these rows still ties to the account totals.

    `amount` is the raw signed SUM the warehouse stores: expenses negative,
    income positive, on all four account types (see the sign note in
    budget_analysis - it describes a convention the current Golden1 exports do
    not exhibit, but the fixture CSVs under docs/examples do).
    """
    names = _category_names()
    qs = AllTransaction.objects.all()
    if start:
        qs = qs.filter(calendar_date__gte=start)
    if end:
        qs = qs.filter(calendar_date__lte=end)
    return [_named(row, names) for row in qs.values(*_BREAKDOWN_FIELDS)]


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
        row['category_sk']: row['total']
        for row in qs.values('category_sk').annotate(total=Sum('transaction_amount'))
    }

    rows = []
    for budget in BudgetMap.objects.all():
        rows.append(
            {
                'category': budget.category,
                'sub_category': budget.sub_category,
                'category_budget': budget.category_budget,
                'sub_category_budget': budget.sub_category_budget,
                'actual': actuals.get(budget.category_sk, 0.0),
            }
        )
    return rows
