"""
Auth events are logged via Django's built-in signals (shell/signals.py) so
every login path - /api/auth, django-allauth SSO, /admin/ - produces the
same omniview.auth lines. Exactly one line per event: the endpoints must
not also log (they used to before M8).
"""

import logging

import pytest
from django.contrib.auth.models import User


@pytest.fixture
def user(db):
    return User.objects.create_user(username='joseph', password='correct-horse-battery-9')


def _auth_records(caplog):
    return [r for r in caplog.records if r.name == 'omniview.auth']


def test_login_success_logs_once_at_info(client, user, caplog):
    with caplog.at_level(logging.INFO, logger='omniview.auth'):
        response = client.post(
            '/api/auth/login',
            data={'username': 'joseph', 'password': 'correct-horse-battery-9'},
            content_type='application/json',
        )
    assert response.status_code == 200
    records = _auth_records(caplog)
    assert len(records) == 1
    assert records[0].levelno == logging.INFO
    assert records[0].getMessage() == 'User joseph logged in'


def test_login_failure_logs_once_at_warning(client, user, caplog):
    with caplog.at_level(logging.INFO, logger='omniview.auth'):
        response = client.post(
            '/api/auth/login',
            data={'username': 'joseph', 'password': 'wrong'},
            content_type='application/json',
        )
    assert response.status_code == 401
    records = _auth_records(caplog)
    assert len(records) == 1
    assert records[0].levelno == logging.WARNING
    assert "username='joseph'" in records[0].getMessage()


def test_logout_logs_once_at_info(client, user, caplog):
    client.force_login(user)  # fires user_logged_in - not the event under test
    caplog.clear()
    with caplog.at_level(logging.INFO, logger='omniview.auth'):
        response = client.post('/api/auth/logout')
    assert response.status_code == 204
    records = _auth_records(caplog)
    assert len(records) == 1
    assert records[0].getMessage() == 'User joseph logged out'


def test_anonymous_logout_logs_nothing(client, db, caplog):
    with caplog.at_level(logging.INFO, logger='omniview.auth'):
        response = client.post('/api/auth/logout')
    assert response.status_code == 204
    assert _auth_records(caplog) == []
