"""ExpenseTracker's API surface: one router, mounted once at /api/expense-tracker/.

The four Django apps each expose their own router; this composes them so the
shell mounts one thing per OmniView app rather than one thing per Django app.
Auth is applied at the mount in config/api.py and inherited by everything here
(django-ninja 1.6 passes a parent router's auth down to nested routers), so
every endpoint below requires an expense-tracker grant. config/tests/
test_auth_enforcement.py is what actually holds that guarantee down.
"""

from ninja import Router

router = Router()

router.add_router('/dailymetrics', 'apps.expense_tracker.dailymetrics.api.router')
router.add_router('/transactions', 'apps.expense_tracker.transactions.api.router')
router.add_router('/budgets', 'apps.expense_tracker.budgets.api.router')
router.add_router('/rawdata', 'apps.expense_tracker.rawdata.api.router')
