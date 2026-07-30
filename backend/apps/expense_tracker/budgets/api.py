from ninja import Body, Router
from ninja.errors import HttpError

from apps.expense_tracker.pipeline import is_rebuild_running, run_rebuild

from .models import BudgetMap
from .schemas import BudgetMapOut, RebuildResult
from .yaml_repository import BudgetMapValidationError, load_budget_map, save_budget_map

router = Router()


@router.get("/map", response=list[BudgetMapOut])
def list_budget_map(request):
    return list(BudgetMap.objects.all())


@router.get("/yaml")
def get_budget_yaml(request, bank: str = "Golden1"):
    return load_budget_map(bank)


@router.put("/yaml")
def put_budget_yaml(request, payload: dict = Body(...), bank: str = "Golden1"):
    try:
        save_budget_map(payload, bank)
    except BudgetMapValidationError as exc:
        raise HttpError(422, "; ".join(exc.errors))
    return {"status": "ok"}


@router.post("/rebuild", response=RebuildResult)
def rebuild(request):
    return run_rebuild()


@router.get("/rebuild/status")
def rebuild_status(request):
    """Whether a rebuild is in flight, so the UI can reconnect its progress bar
    after a reload instead of showing an idle button mid-rebuild."""
    return {"running": is_rebuild_running()}
