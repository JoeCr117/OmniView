from ninja import Router
from ninja.pagination import LimitOffsetPagination, paginate

from .models import DailyMetric
from .schemas import DailyMetricOut

router = Router()


@router.get("", response=list[DailyMetricOut])
@paginate(LimitOffsetPagination)
def list_daily_metrics(request, start: str | None = None, end: str | None = None):
    qs = DailyMetric.objects.all()
    if start:
        qs = qs.filter(calendar_date__gte=start)
    if end:
        qs = qs.filter(calendar_date__lte=end)
    return qs


@router.get("/summary", response=DailyMetricOut)
def daily_metrics_summary(request):
    return DailyMetric.objects.latest("date_sk")
