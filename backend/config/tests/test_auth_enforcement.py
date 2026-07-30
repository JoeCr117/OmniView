"""
OMNIVIEW_AUTH_REQUIRED gates three surfaces, all read per-request so the
settings fixture can flip the flag: the API (SessionAuthWhenRequired),
/api/docs (docs_decorator), and HTML page serving (frontend_view). Since M6
the flag defaults ON in base.py (OMNIVIEW_AUTH_REQUIRED=0 is the escape
hatch); config.settings.test pins it off so the suite exercises the open API
by default, and these tests flip it on via the auth_on fixture.
"""

import pytest
from django.contrib.auth.models import User
from django.test import Client

from apps.expense_tracker.tests.fixtures import VALID_BUDGET_MAP

YAML_URL = '/api/expense-tracker/budgets/yaml?bank=Golden1'


@pytest.fixture
def auth_on(settings):
    settings.OMNIVIEW_AUTH_REQUIRED = True


@pytest.fixture
def user(db):
    user = User.objects.create_user(username='joseph', password='correct-horse-battery-9')
    # Access is deny-by-default since the Admin Portal milestone: the
    # expense-tracker routers sit behind AppAccessAuth, so the signed-in
    # test identity needs its grant (this file tests the auth flag, not the
    # access model - apps/admin_portal/tests/test_enforcement.py covers that).
    from apps.admin_portal.models import AppAccess

    AppAccess.objects.create(user=user, app_id='expense-tracker')
    return user


def test_api_401s_when_flag_on(auth_on, client, golden1_data):
    response = client.get(YAML_URL)
    assert response.status_code == 401


def test_api_works_for_logged_in_user(auth_on, client, user, golden1_data):
    client.force_login(user)
    response = client.get(YAML_URL)
    assert response.status_code == 200
    assert response.json() == VALID_BUDGET_MAP


def test_auth_endpoints_stay_open_when_flag_on(auth_on, client, db):
    assert client.get('/api/auth/config').status_code == 200
    assert client.get('/api/auth/csrf').status_code == 204
    # /me is reachable (no global 401 short-circuit), just unauthenticated.
    assert client.get('/api/auth/me').status_code == 401


def test_api_writes_enforce_csrf_when_flag_on(auth_on, user, golden1_data):
    enforcing = Client(enforce_csrf_checks=True)
    enforcing.force_login(user)
    response = enforcing.put(YAML_URL, data=VALID_BUDGET_MAP, content_type='application/json')
    assert response.status_code == 403

    assert enforcing.get('/api/auth/csrf').status_code == 204
    token = enforcing.cookies['csrftoken'].value
    response = enforcing.put(
        YAML_URL,
        data=VALID_BUDGET_MAP,
        content_type='application/json',
        headers={'x-csrftoken': token},
    )
    assert response.status_code == 200


def test_docs_redirect_to_login_when_flag_on(auth_on, client, db):
    response = client.get('/api/docs')
    assert response.status_code == 302
    assert response['Location'] == '/login?next=/api/docs'


def test_docs_open_when_flag_off(client):
    assert client.get('/api/docs').status_code == 200


def test_pages_redirect_to_login_when_flag_on(auth_on, client, db):
    for page in ('/', '/apps/expense-tracker/check-book'):
        response = client.get(page)
        assert response.status_code == 302
        assert response['Location'] == f'/login?next={page}'


def test_login_page_and_assets_pass_unauthenticated(auth_on, client, db, settings, tmp_path):
    settings.FRONTEND_EXPORT_DIR = tmp_path
    (tmp_path / 'login.html').write_text('<html>login</html>', encoding='utf-8')
    chunk = tmp_path / '_next' / 'static'
    chunk.mkdir(parents=True)
    (chunk / 'app.js').write_text('// chunk', encoding='utf-8')
    (tmp_path / 'favicon.ico').write_bytes(b'\x00')

    assert client.get('/login').status_code == 200
    assert client.get('/_next/static/app.js').status_code == 200
    assert client.get('/favicon.ico').status_code == 200


def test_admin_portal_pages_404_for_non_staff(auth_on, client, user, settings, tmp_path):
    # Defense in depth: the Admin Portal's exported pages are staff-only
    # (the /api/admin-portal endpoints are the real boundary).
    settings.FRONTEND_EXPORT_DIR = tmp_path
    (tmp_path / 'apps' / 'admin-portal').mkdir(parents=True)
    (tmp_path / 'apps' / 'admin-portal' / 'users.html').write_text('<html>admin</html>', encoding='utf-8')

    client.force_login(user)
    assert client.get('/apps/admin-portal/users').status_code == 404

    staff = User.objects.create_user(username='boss', password='boss-pass-9', is_staff=True)
    client.force_login(staff)
    assert client.get('/apps/admin-portal/users').status_code == 200


def test_legacy_redirects_win_over_the_login_gate(auth_on, client, db):
    response = client.get('/check-book')
    assert response.status_code == 301
    assert response['Location'] == '/apps/expense-tracker/check-book'


def test_flag_off_escape_hatch_allows_anonymous_access(client, golden1_data):
    # No auth_on fixture (test settings pin the flag off): the API answers
    # anonymously - the OMNIVIEW_AUTH_REQUIRED=0 escape-hatch behavior.
    assert client.get(YAML_URL).status_code == 200


def test_flag_defaults_on_in_base_settings():
    # base.py must default the env flag ON since M6 (test.py overrides it).
    import importlib
    import os
    from unittest import mock

    with mock.patch.dict(os.environ):
        os.environ.pop('OMNIVIEW_AUTH_REQUIRED', None)
        os.environ.setdefault('LOG_LEVEL', 'INFO')
        base = importlib.import_module('config.settings.base')
        base = importlib.reload(base)
        assert base.OMNIVIEW_AUTH_REQUIRED is True
    importlib.reload(base)  # restore module state under the real env
