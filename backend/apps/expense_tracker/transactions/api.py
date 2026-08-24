from ninja import Router
from ninja.pagination import LimitOffsetPagination, paginate

from .models import AllTransaction, UncategorizedTransaction
from .schemas import (
    AllTransactionOut,
    BreakdownRow,
    BudgetAnalysisRow,
    UncategorizedTransactionOut,
)
from .services import breakdown_rows, budget_analysis

router = Router()


@router.get('', response=list[AllTransactionOut])
@paginate(LimitOffsetPagination)
def list_transactions(
    request,
    start: str | None = None,
    end: str | None = None,
    category_sk: int | None = None,
    account_type: str | None = None,
):
    qs = AllTransaction.objects.all()
    if start:
        qs = qs.filter(calendar_date__gte=start)
    if end:
        qs = qs.filter(calendar_date__lte=end)
    if category_sk is not None:
        qs = qs.filter(category_sk=category_sk)
    if account_type:
        qs = qs.filter(account_type=account_type)
    return qs


@router.get('/breakdown', response=list[BreakdownRow])
def get_breakdown(request, start: str | None = None, end: str | None = None):
    return breakdown_rows(start, end)


@router.get('/budget-analysis', response=list[BudgetAnalysisRow])
def get_budget_analysis(request, start: str | None = None, end: str | None = None):
    return budget_analysis(start, end)


@router.get('/uncategorized', response=list[UncategorizedTransactionOut])
@paginate(LimitOffsetPagination)
def list_uncategorized(request, start: str | None = None, end: str | None = None):
    qs = UncategorizedTransaction.objects.all()
    if start:
        qs = qs.filter(calendar_date__gte=start)
    if end:
        qs = qs.filter(calendar_date__lte=end)
    return qs
