"""ExpenseTracker's ETL, as the web layer sees it.

The pipeline itself is pipelines/expense_tracker/main.py; the machinery for
running one lives in shell/pipeline.py. This is only the binding between them,
so the Rebuild endpoint (budgets/api.py) doesn't have to know either detail.
"""

from django.conf import settings
from shell.pipeline import is_rebuild_running, run_pipeline

__all__ = ['is_rebuild_running', 'run_rebuild']

PIPELINE_MODULE = 'pipelines.expense_tracker.main'


def run_rebuild() -> dict:
    """Re-run the ETL: re-parse the stored CSVs and rebuild every dbt model."""
    return run_pipeline(PIPELINE_MODULE, settings.PIPELINE_ROOT)
