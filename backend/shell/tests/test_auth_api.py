"""
Session auth endpoints (/api/auth/*). The default test client skips CSRF
enforcement (Django sets _dont_enforce_csrf_checks), so the CSRF tests build
their own Client(enforce_csrf_checks=True).
"""

import pytest
from django.contrib.auth.models import User
from django.test import Client

LOGIN = '/api/auth/login'
CREDENTIALS = {'username': 'joseph', 'password': 'correct-horse-battery-9'}


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username='joseph',
        email='joseph@example.com',
        password='correct-horse-battery-9',
        first_name='Joseph',
    )


def test_csrf_endpoint_sets_cookie(client):
    response = client.get('/api/auth/csrf')
    assert response.status_code == 204
    assert 'csrftoken' in response.cookies


def test_login_success_returns_user_and_session(client, user):
    response = client.post(LOGIN, data=CREDENTIALS, content_type='application/json')
    assert response.status_code == 200
    body = response.json()
    assert body['username'] == 'joseph'
    assert body['email'] == 'joseph@example.com'
    assert body['is_staff'] is False
    assert 'sessionid' in response.cookies


def test_login_wrong_password_401s(client, user):
    response = client.post(
        LOGIN,
        data={'username': 'joseph', 'password': 'wrong'},
        content_type='application/json',
    )
    assert response.status_code == 401
    assert 'sessionid' not in response.cookies


def test_login_missing_fields_422s(client, db):
    response = client.post(LOGIN, data={'username': 'joseph'}, content_type='application/json')
    assert response.status_code == 422


def test_me_unauthenticated_401s(client, db):
    assert client.get('/api/auth/me').status_code == 401


def test_me_returns_logged_in_user(client, user):
    client.force_login(user)
    response = client.get('/api/auth/me')
    assert response.status_code == 200
    assert response.json()['username'] == 'joseph'


def test_logout_ends_the_session(client, user):
    client.force_login(user)
    assert client.post('/api/auth/logout').status_code == 204
    assert client.get('/api/auth/me').status_code == 401


def test_login_enforces_csrf(user):
    enforcing = Client(enforce_csrf_checks=True)
    response = enforcing.post(LOGIN, data=CREDENTIALS, content_type='application/json')
    assert response.status_code == 403

    assert enforcing.get('/api/auth/csrf').status_code == 204
    token = enforcing.cookies['csrftoken'].value
    response = enforcing.post(
        LOGIN,
        data=CREDENTIALS,
        content_type='application/json',
        headers={'x-csrftoken': token},
    )
    assert response.status_code == 200


def test_logout_enforces_csrf(user):
    enforcing = Client(enforce_csrf_checks=True)
    enforcing.force_login(user)
    assert enforcing.post('/api/auth/logout').status_code == 403


def test_config_defaults_off(client, settings):
    settings.OMNIVIEW_AUTH_REQUIRED = False
    settings.AZURE_CLIENT_ID = ''
    settings.AZURE_AUTO_LOGIN = False
    assert client.get('/api/auth/config').json() == {
        'auth_required': False,
        'azure_enabled': False,
        'azure_auto_login': False,
        'sso_managed': False,
    }


def test_config_reflects_settings(client, settings):
    settings.OMNIVIEW_AUTH_REQUIRED = True
    settings.AZURE_CLIENT_ID = 'some-client-id'
    settings.AZURE_AUTO_LOGIN = True
    settings.SSO_MANAGED = True
    assert client.get('/api/auth/config').json() == {
        'auth_required': True,
        'azure_enabled': True,
        'azure_auto_login': True,
        'sso_managed': True,
    }


def test_session_signed_out_carries_config_and_null_user_and_sets_csrf(client, db, settings):
    settings.OMNIVIEW_AUTH_REQUIRED = True
    response = client.get('/api/auth/session')
    assert response.status_code == 200
    body = response.json()
    assert body['user'] is None
    assert body['config']['auth_required'] is True
    # The whole point: the csrftoken cookie rides along, so the SPA needs no
    # separate /csrf call before its first write.
    assert 'csrftoken' in response.cookies


def test_session_signed_in_embeds_the_user(client, user):
    client.force_login(user)
    body = client.get('/api/auth/session').json()
    assert body['user']['username'] == 'joseph'
    assert body['user']['email'] == 'joseph@example.com'
    assert body['user']['is_staff'] is False
    assert set(body['config']) == {
        'auth_required',
        'azure_enabled',
        'azure_auto_login',
        'sso_managed',
    }
