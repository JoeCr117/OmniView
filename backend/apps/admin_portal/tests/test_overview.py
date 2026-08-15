"""
The Overview endpoint always 200s: DB KPIs are always present, Databricks
KPIs degrade to None + connected=False when the workspace is unreachable.
"""

import pytest
from django.contrib.auth.models import User
from django.core.cache import cache

from apps.admin_portal import services
from apps.admin_portal.databricks import DatabricksNotConnected

pytestmark = pytest.mark.django_db

URL = '/api/admin-portal/overview'


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


def test_degrades_without_databricks(client, monkeypatch):
    User.objects.create_user(username='member')
    User.objects.create_user(username='boss', is_staff=True)

    def boom(request):
        raise DatabricksNotConnected('nope')

    monkeypatch.setattr(services, 'obo_client', boom)
    body = client.get(URL).json()
    assert body['users'] == {'total': 2, 'admins': 1}
    assert body['connected'] is False
    assert body['jobs'] is None
    assert body['dbus_30d'] is None


def test_full_overview_when_connected(client, settings, monkeypatch):
    settings.OMNIVIEW_SQL_WAREHOUSE_ID = 'wh-123'
    monkeypatch.setattr(
        services,
        'jobs_overview_for',
        lambda request: {'counts': {'jobs': 2, 'running': 1, 'completed': 3, 'failed': 2}},
    )
    monkeypatch.setattr(
        services,
        'costs_overview_for',
        lambda request, days: {'kpis': {'total_dbus': 4.5}},
    )
    body = client.get(URL).json()
    assert body['connected'] is True
    assert body['jobs'] == {'running': 1, 'failed': 2}
    assert body['dbus_30d'] == 4.5
