"""Fixtures pytest must be able to see from anywhere in the suite.

pytest only shares fixtures downward from a conftest, so anything used across
app boundaries has to be published here. That is exactly the case for
ExpenseTracker's sample data: the shell's auth-enforcement tests need a real
app to be granted and denied access *to*, so they seed it too.

The definitions themselves belong to the app, not to the shell - they live in
apps/expense_tracker/tests/fixtures.py. This module only re-exports them.

The suite runs under config.settings.test (in-memory DBs, sentinel data paths),
so the real Data/ tree - production data - is never involved.
"""

from apps.expense_tracker.tests.fixtures import (  # noqa: F401  (pytest fixtures)
    datavault_tables,
    golden1_data,
)
