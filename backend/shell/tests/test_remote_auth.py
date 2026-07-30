"""
Databricks deployment auth pieces, exercised without Databricks:

- ForwardedEmailMiddleware/Backend: X-Forwarded-Email header signs the caller
  in, auto-creating the user on first visit (config.settings.databricks is
  the only module that wires these up - the unit suite opts in per-test).
- config.pg_lakebase engine: password passthrough when configured, OAuth
  token minting when the password is empty.
- shell.pipeline: the rebuild subprocess gets PGPASSWORD injected from the
  token helper when running on Databricks (ENDPOINT_NAME set, no PGPASSWORD).
"""

from types import SimpleNamespace

import pytest
from django.contrib.auth.models import User

from shell import pipeline

HEADERS = {'X-Forwarded-Email': 'joseph@example.com'}


@pytest.fixture
def remote_auth(settings):
    """The middleware/backend wiring config.settings.databricks applies."""
    settings.MIDDLEWARE = [
        'config.middleware.RequestLogMiddleware',
        'django.contrib.sessions.middleware.SessionMiddleware',
        'django.middleware.common.CommonMiddleware',
        'django.middleware.csrf.CsrfViewMiddleware',
        'django.contrib.auth.middleware.AuthenticationMiddleware',
        'shell.remote_auth.ForwardedEmailMiddleware',
        'allauth.account.middleware.AccountMiddleware',
    ]
    settings.AUTHENTICATION_BACKENDS = [
        'shell.remote_auth.ForwardedEmailBackend',
        'django.contrib.auth.backends.ModelBackend',
    ]


@pytest.mark.usefixtures('remote_auth')
class TestForwardedEmailAuth:
    @pytest.mark.django_db
    def test_header_signs_in_and_auto_creates_user(self, client):
        response = client.get('/api/auth/me', headers=HEADERS)
        assert response.status_code == 200
        body = response.json()
        assert body['username'] == 'joseph@example.com'
        # configure_user mirrored the identity into the email field.
        assert body['email'] == 'joseph@example.com'
        assert User.objects.filter(username='joseph@example.com').count() == 1

    @pytest.mark.django_db
    def test_second_request_reuses_the_user(self, client):
        client.get('/api/auth/me', headers=HEADERS)
        client.get('/api/auth/me', headers=HEADERS)
        assert User.objects.filter(username='joseph@example.com').count() == 1

    @pytest.mark.django_db
    def test_no_header_stays_anonymous(self, client, settings):
        settings.OMNIVIEW_AUTH_REQUIRED = True
        assert client.get('/api/auth/me').status_code == 401
        assert client.get('/api/expense-tracker/budgets/yaml?bank=Golden1').status_code == 401

    @pytest.mark.django_db
    def test_header_authenticates_the_gated_api(self, client, settings, golden1_data):
        # The admin-email promotion makes the header identity staff, which
        # bypasses the deny-by-default app grants - the exact path the real
        # admin takes on Databricks.
        settings.OMNIVIEW_AUTH_REQUIRED = True
        settings.OMNIVIEW_ADMIN_EMAILS = ['joseph@example.com']
        response = client.get('/api/expense-tracker/budgets/yaml?bank=Golden1', headers=HEADERS)
        assert response.status_code == 200


def test_databricks_allowed_hosts_cover_the_proxy_host():
    # The Databricks proxy forwards with Host: localhost:<port> while browsers
    # send the public https Origin - both must be accepted or every request
    # 400s (DisallowedHost) after sign-in.
    import importlib
    import os
    from unittest import mock

    with mock.patch.dict(
        os.environ,
        {'OMNIVIEW_APP_URL': 'https://x.databricksapps.com', 'PGPASSWORD': 'pw'},
    ):
        import config.settings.databricks as databricks_settings

        module = importlib.reload(databricks_settings)
        assert module.ALLOWED_HOSTS == ['x.databricksapps.com', 'localhost', '127.0.0.1']
        assert module.CSRF_TRUSTED_ORIGINS == ['https://x.databricksapps.com']
    importlib.reload(module)  # restore module state under the real env


class TestLakebaseEngine:
    @staticmethod
    def _params(password):
        from django.db.utils import ConnectionHandler

        handler = ConnectionHandler({
            'default': {
                'ENGINE': 'config.pg_lakebase',
                'NAME': 'omniview',
                'HOST': '127.0.0.1',
                'PORT': '5432',
                'USER': 'omniview',
                'PASSWORD': password,
            }
        })
        return handler['default'].get_connection_params()

    def test_configured_password_wins(self):
        assert self._params('explicit-password')['password'] == 'explicit-password'

    def test_empty_password_mints_a_token(self, monkeypatch):
        from config.pg_lakebase import credentials

        monkeypatch.setattr(credentials, 'lakebase_token', lambda: 'oauth-token')
        assert self._params('')['password'] == 'oauth-token'


class TestPipelineEnv:
    @pytest.fixture
    def captured_env(self, monkeypatch):
        captured = {}

        def fake_run(*args, **kwargs):
            captured.update(kwargs['env'])
            return SimpleNamespace(returncode=0, stdout='', stderr='')

        monkeypatch.setattr(pipeline.subprocess, 'run', fake_run)
        monkeypatch.setattr(pipeline.connections, 'close_all', lambda: None)
        return captured

    def test_databricks_injects_token_as_pgpassword(self, monkeypatch, captured_env):
        from config.pg_lakebase import credentials

        monkeypatch.delenv('PGPASSWORD', raising=False)
        monkeypatch.setenv('ENDPOINT_NAME', 'projects/p/branches/b/endpoints/e')
        monkeypatch.setattr(credentials, 'lakebase_token', lambda: 'oauth-token')
        assert pipeline.run_pipeline('pipelines.expense_tracker.main', 'unused-root')['status'] == 'ok'
        assert captured_env['PGPASSWORD'] == 'oauth-token'

    def test_existing_pgpassword_is_left_alone(self, monkeypatch, captured_env):
        monkeypatch.setenv('PGPASSWORD', 'local-password')
        monkeypatch.setenv('ENDPOINT_NAME', 'projects/p/branches/b/endpoints/e')
        assert pipeline.run_pipeline('pipelines.expense_tracker.main', 'unused-root')['status'] == 'ok'
        assert captured_env['PGPASSWORD'] == 'local-password'

    def test_venv_bin_dir_leads_the_subprocess_path(self, captured_env):
        # pydbt shells out to `dbt` by name; Databricks Apps never puts the
        # venv on PATH, so the pipeline must (dbt exit 127 regression).
        import os
        import sys

        assert pipeline.run_pipeline('pipelines.expense_tracker.main', 'unused-root')['status'] == 'ok'
        expected_bin = os.path.dirname(os.path.abspath(sys.executable))
        assert captured_env['PATH'].split(os.pathsep)[0] == expected_bin
