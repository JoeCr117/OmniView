"""
The dashboard namespaces every app's API under /api/<app-id>/ - these tests
pin the ExpenseTracker prefix (and the removal of the old top-level paths)
using the source-data endpoints (budgets/yaml + rawdata, seeded as DB rows
by the golden1_data fixture).
"""

from apps.expense_tracker.tests.fixtures import VALID_BUDGET_MAP


def test_budgets_yaml_lives_under_expense_tracker(client, golden1_data):
    response = client.get('/api/expense-tracker/budgets/yaml?bank=Golden1')
    assert response.status_code == 200
    assert response.json() == VALID_BUDGET_MAP


def test_rawdata_accounts_lives_under_expense_tracker(client, golden1_data):
    response = client.get('/api/expense-tracker/rawdata/accounts?bank=Golden1')
    assert response.status_code == 200
    assert response.json() == ['CreditCard', 'Savings']


def test_invalid_budget_map_put_422s(client, golden1_data):
    response = client.put(
        '/api/expense-tracker/budgets/yaml?bank=Golden1',
        data='{"Car": {"Budget": "not-a-number"}}',
        content_type='application/json',
    )
    assert response.status_code == 422


def test_old_top_level_api_paths_are_gone(client, golden1_data):
    assert client.get('/api/budgets/yaml?bank=Golden1').status_code == 404
    assert client.get('/api/rawdata/accounts?bank=Golden1').status_code == 404


def test_rebuild_status_reports_idle_when_no_rebuild_running(client, db):
    response = client.get('/api/expense-tracker/budgets/rebuild/status')
    assert response.status_code == 200
    assert response.json() == {'running': False}


def test_rebuild_status_reports_running_while_the_lock_is_held(client, db):
    from shell import pipeline

    assert pipeline._rebuild_lock.acquire(blocking=False)
    try:
        assert client.get('/api/expense-tracker/budgets/rebuild/status').json() == {'running': True}
    finally:
        pipeline._rebuild_lock.release()
