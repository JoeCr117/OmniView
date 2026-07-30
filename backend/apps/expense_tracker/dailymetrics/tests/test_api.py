"""
First gold-table endpoint tests: the router must send these reads to the
`datavault` alias, where the datavault_tables fixture seeded the dbt schema
(backend/tests/fixtures/datavault_schema.sql).
"""

import pytest

pytestmark = pytest.mark.django_db(databases=['default', 'datavault'])


def test_list_reads_seeded_datavault_rows(client, datavault_tables):
    response = client.get('/api/expense-tracker/dailymetrics?limit=10')
    assert response.status_code == 200
    body = response.json()
    assert body['count'] == 3
    assert [row['date_sk'] for row in body['items']] == [20240101, 20240102, 20240103]
    assert body['items'][0]['total_balance'] == 1637.50


def test_list_filters_by_date_range(client, datavault_tables):
    response = client.get('/api/expense-tracker/dailymetrics?start=2024-01-02&end=2024-01-02')
    assert response.status_code == 200
    body = response.json()
    assert body['count'] == 1
    assert body['items'][0]['calendar_date'] == '2024-01-02'


def test_summary_returns_latest_day(client, datavault_tables):
    response = client.get('/api/expense-tracker/dailymetrics/summary')
    assert response.status_code == 200
    assert response.json()['date_sk'] == 20240103
