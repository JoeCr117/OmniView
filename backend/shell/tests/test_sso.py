"""
Azure Entra ID SSO (M7). The provider is configured entirely from settings
(no SocialApp DB rows): config.settings.test pins SOCIALACCOUNT_PROVIDERS
empty, and these tests opt in via override_settings. Only the outbound leg
of the OAuth flow is testable offline - the real round-trip against
login.microsoftonline.com is a manual verification with the user's Entra
app registration.
"""

import importlib
import os
from urllib.parse import parse_qs, urlsplit

import pytest

MICROSOFT_LOGIN_URL = '/accounts/microsoft/login/'

CONFIGURED_PROVIDERS = {
    'microsoft': {
        'APPS': [
            {
                'client_id': 'test-client-id',
                'secret': 'test-secret',
                'settings': {'tenant': 'test-tenant'},
            }
        ]
    }
}


@pytest.fixture
def azure_configured(settings):
    settings.SOCIALACCOUNT_PROVIDERS = CONFIGURED_PROVIDERS


def test_microsoft_login_redirects_to_entra(azure_configured, client, db):
    response = client.get(MICROSOFT_LOGIN_URL)
    assert response.status_code == 302
    url = urlsplit(response['Location'])
    assert url.scheme == 'https'
    assert url.netloc == 'login.microsoftonline.com'
    # Tenant comes from the app's settings dict, not a top-level key.
    assert url.path == '/test-tenant/oauth2/v2.0/authorize'
    params = parse_qs(url.query)
    assert params['client_id'] == ['test-client-id']
    assert params['redirect_uri'] == ['http://testserver/accounts/microsoft/login/callback/']
    assert params['scope'] == ['User.Read']
    assert 'state' in params


def test_microsoft_login_stashes_next(azure_configured, client, db):
    response = client.get(MICROSOFT_LOGIN_URL, {'next': '/apps/expense-tracker'})
    assert response.status_code == 302
    states = client.session['socialaccount_states']
    assert len(states) == 1
    (state, _timestamp) = next(iter(states.values()))
    assert state['next'] == '/apps/expense-tracker'


def test_microsoft_login_works_with_auth_flag_on(azure_configured, client, db, settings):
    # /accounts/* is mounted above the SPA catch-all, so the page gate
    # (frontend_view) never sees it - anonymous users must be able to start
    # the SSO flow while enforcement is on.
    settings.OMNIVIEW_AUTH_REQUIRED = True
    response = client.get(MICROSOFT_LOGIN_URL)
    assert response.status_code == 302
    assert response['Location'].startswith('https://login.microsoftonline.com/')


def test_allauth_account_urls_mounted(client, db):
    # Not used by OmniView's own UI, but proves include('allauth.urls') wins
    # over the catch-all (a SPA response would be HTML with our Next markup).
    assert client.get('/accounts/login/').status_code == 200


def test_provider_config_built_from_env():
    from config.settings import base

    env_before = {
        name: os.environ.get(name)
        for name in ('AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID')
    }
    os.environ.update(
        AZURE_CLIENT_ID='env-client-id',
        AZURE_CLIENT_SECRET='env-secret',
        AZURE_TENANT_ID='env-tenant',
    )
    try:
        reloaded = importlib.reload(base)
        assert reloaded.SOCIALACCOUNT_PROVIDERS == {
            'microsoft': {
                'APPS': [
                    {
                        'client_id': 'env-client-id',
                        'secret': 'env-secret',
                        'settings': {'tenant': 'env-tenant'},
                    }
                ]
            }
        }
    finally:
        for name, value in env_before.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        importlib.reload(base)


def test_provider_config_empty_without_client_id():
    from config.settings import base

    env_before = os.environ.get('AZURE_CLIENT_ID')
    os.environ.pop('AZURE_CLIENT_ID', None)
    try:
        reloaded = importlib.reload(base)
        assert reloaded.SOCIALACCOUNT_PROVIDERS == {}
    finally:
        if env_before is not None:
            os.environ['AZURE_CLIENT_ID'] = env_before
        importlib.reload(base)
