from ninja import Schema


class BudgetMapOut(Schema):
    category_sk: int
    category: str
    category_budget: float | None
    sub_category: str
    sub_category_budget: float | None


class RebuildResult(Schema):
    status: str
    stdout: str
    stderr: str
    returncode: int | None
