"""OmniView's data pipelines.

One subpackage per OmniView app that has an ETL (`expense_tracker`), plus
`common` for the pieces any pipeline can reuse. Pipelines are *not* Django
processes: the web layer (backend/) invokes them as a subprocess, never by
import, so nothing here may import Django. The only contract between the two
sides is the set of table names asserted in
backend/config/tests/test_schema_contract.py.

Run one with the repo root as the working directory, e.g.

    uv run python -m pipelines.expense_tracker.main
"""
