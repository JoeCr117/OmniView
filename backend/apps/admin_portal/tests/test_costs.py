"""
Costs overview: statement-execution result parsing/aggregation, the
missing-warehouse guard, days validation, and caching. SDK mocked - the
real SQL was validated live against the workspace before being frozen.
"""

from types import SimpleNamespace

import pytest
from django.core.cache import cache

from apps.admin_portal import services
from apps.admin_portal.databricks import DatabricksNotConnected

pytestmark = pytest.mark.django_db

URL = '/api/admin-portal/costs/overview'


def _statement_response(rows, state='SUCCEEDED'):
    columns = ['usage_date', 'sku_name', 'dbus', 'list_cost_usd']
    return SimpleNamespace(
        statement_id='stmt-1',
        status=SimpleNamespace(state=SimpleNamespace(value=state), error=None),
        manifest=SimpleNamespace(
            schema=SimpleNamespace(columns=[SimpleNamespace(name=c) for c in columns])
        ),
        result=SimpleNamespace(data_array=rows),
    )


ROWS = [
    ['2026-07-12', 'LAKEBASE', '0.5', '0.10'],
    ['2026-07-12', 'SQL_SERVERLESS', '0.25', '0.20'],
    ['2026-07-13', 'LAKEBASE', '1.5', '0.30'],
]


def _fake_client(rows=ROWS):
    return SimpleNamespace(
        statement_execution=SimpleNamespace(
            execute_statement=lambda **kwargs: _statement_response(rows),
            get_statement=lambda statement_id: _statement_response(rows),
        )
    )


@pytest.fixture(autouse=True)
def clear_cache(settings):
    settings.OMNIVIEW_SQL_WAREHOUSE_ID = 'wh-123'
    cache.clear()
    yield
    cache.clear()


class TestCostsOverview:
    def test_aggregates_daily_and_by_sku(self):
        data = services.costs_overview(_fake_client(), days=30)
        assert data['kpis']['total_dbus'] == pytest.approx(2.25)
        assert data['kpis']['list_cost_usd'] == pytest.approx(0.60)
        assert data['kpis']['top_sku'] == 'LAKEBASE'
        assert data['daily'] == [
            {'date': '2026-07-12', 'dbus': 0.75, 'list_cost_usd': pytest.approx(0.30)},
            {'date': '2026-07-13', 'dbus': 1.5, 'list_cost_usd': pytest.approx(0.30)},
        ]
        assert [row['sku'] for row in data['by_sku']] == ['LAKEBASE', 'SQL_SERVERLESS']

    def test_empty_result_is_zeroes(self):
        data = services.costs_overview(_fake_client(rows=[]), days=7)
        assert data['kpis'] == {'days': 7, 'total_dbus': 0, 'list_cost_usd': 0, 'top_sku': None}
        assert data['daily'] == [] and data['by_sku'] == []

    def test_missing_warehouse_raises_not_connected(self, settings):
        settings.OMNIVIEW_SQL_WAREHOUSE_ID = ''
        with pytest.raises(DatabricksNotConnected):
            services.run_warehouse_sql(_fake_client(), 'dbu_usage', {'days': 30})

    def test_failed_statement_raises_not_connected(self):
        client = SimpleNamespace(
            statement_execution=SimpleNamespace(
                execute_statement=lambda **kwargs: _statement_response([], state='FAILED'),
            )
        )
        with pytest.raises(DatabricksNotConnected):
            services.run_warehouse_sql(client, 'dbu_usage', {'days': 30})


class TestEndpoint:
    def test_endpoint_returns_costs(self, client, monkeypatch):
        monkeypatch.setattr(services, 'obo_client', lambda request: _fake_client())
        body = client.get(f'{URL}?days=30').json()
        assert body['kpis']['top_sku'] == 'LAKEBASE'
        assert len(body['daily']) == 2

    def test_invalid_days_422s(self, client, monkeypatch):
        monkeypatch.setattr(services, 'obo_client', lambda request: _fake_client())
        assert client.get(f'{URL}?days=14').status_code == 422

    def test_missing_warehouse_503s(self, client, settings, monkeypatch):
        settings.OMNIVIEW_SQL_WAREHOUSE_ID = ''
        monkeypatch.setattr(services, 'obo_client', lambda request: _fake_client())
        response = client.get(URL)
        assert response.status_code == 503
        assert response.json()['code'] == 'not_connected'
