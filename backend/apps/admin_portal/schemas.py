from datetime import datetime

from ninja import Schema


class AdminUserOut(Schema):
    id: int
    username: str
    email: str
    is_staff: bool
    is_active: bool
    last_login: datetime | None
    date_joined: datetime
    app_ids: list[str]

    @staticmethod
    def resolve_app_ids(obj) -> list[str]:
        # Served from the prefetched relation (services.py) - no extra query.
        return sorted(access.app_id for access in obj.app_access.all())


class SetAdminIn(Schema):
    is_staff: bool


class ErrorOut(Schema):
    detail: str


class RunOut(Schema):
    run_id: int
    job_id: int | None
    job_name: str
    life_cycle_state: str
    result_state: str | None
    start_time: datetime | None
    duration_ms: int | None
    # Deep link into the workspace UI, straight from the Jobs API.
    run_page_url: str | None


class JobsCounts(Schema):
    jobs: int
    running: int
    completed: int
    failed: int


class JobsOverviewOut(Schema):
    counts: JobsCounts
    running: list[RunOut]
    completed: list[RunOut]
    failed: list[RunOut]


class CostKpis(Schema):
    days: int
    total_dbus: float
    # List-price equivalent; on Free Edition the actual charge is $0.
    list_cost_usd: float
    top_sku: str | None


class CostDaily(Schema):
    date: str
    dbus: float
    list_cost_usd: float


class CostBySku(Schema):
    sku: str
    dbus: float
    list_cost_usd: float


class CostsOverviewOut(Schema):
    kpis: CostKpis
    daily: list[CostDaily]
    by_sku: list[CostBySku]


class OverviewUsers(Schema):
    total: int
    admins: int


class OverviewJobs(Schema):
    running: int
    failed: int


class PortalOverviewOut(Schema):
    users: OverviewUsers
    connected: bool
    jobs: OverviewJobs | None
    dbus_30d: float | None
