"""
POST /api/logs/frontend: browser-side errors land in the backend log under
omniview.frontend. The endpoint rides the API-wide SessionAuthWhenRequired
(401 for anonymous callers when the flag is on) and rejects oversized or
malformed payloads via the Schema (422).
"""

import logging

import pytest
from django.contrib.auth.models import User

URL = '/api/logs/frontend'

VALID = {
    'level': 'error',
    'message': 'boom',
    'source': 'shell-error-boundary',
    'url': '/apps/expense-tracker/check-book',
    'stack': 'Error: boom\n  at Page',
}


def test_ingests_and_logs_under_frontend_namespace(client, db, caplog):
    with caplog.at_level(logging.DEBUG, logger='omniview.frontend'):
        response = client.post(URL, data=VALID, content_type='application/json')
    assert response.status_code == 204
    record = next(r for r in caplog.records if r.name == 'omniview.frontend')
    assert record.levelno == logging.ERROR
    assert 'boom' in record.getMessage()
    assert 'shell-error-boundary' in record.getMessage()
    assert 'user=anonymous' in record.getMessage()


def test_level_maps_to_python_levels(client, db, caplog):
    with caplog.at_level(logging.DEBUG, logger='omniview.frontend'):
        assert client.post(
            URL,
            data={'level': 'warn', 'message': 'careful'},
            content_type='application/json',
        ).status_code == 204
    record = next(r for r in caplog.records if r.name == 'omniview.frontend')
    assert record.levelno == logging.WARNING


def test_rejects_bad_level_and_missing_message(client, db):
    assert client.post(
        URL, data={'level': 'fatal', 'message': 'x'}, content_type='application/json'
    ).status_code == 422
    assert client.post(
        URL, data={'level': 'error'}, content_type='application/json'
    ).status_code == 422


def test_rejects_oversized_message(client, db):
    payload = {'level': 'error', 'message': 'x' * 4001}
    response = client.post(URL, data=payload, content_type='application/json')
    assert response.status_code == 422


def test_requires_session_when_flag_on(client, db, settings, caplog):
    settings.OMNIVIEW_AUTH_REQUIRED = True
    assert client.post(URL, data=VALID, content_type='application/json').status_code == 401

    user = User.objects.create_user(username='joseph', password='correct-horse-battery-9')
    client.force_login(user)
    with caplog.at_level(logging.DEBUG, logger='omniview.frontend'):
        response = client.post(URL, data=VALID, content_type='application/json')
    assert response.status_code == 204
    record = next(r for r in caplog.records if r.name == 'omniview.frontend')
    assert 'user=joseph' in record.getMessage()
