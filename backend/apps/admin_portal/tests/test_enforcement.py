"""
The 401/403/200 enforcement matrix for the deny-by-default access model:
dashboard-app routers behind AppAccessAuth('expense-tracker'), the Admin
Portal router behind AdminAuth. All checks disengage when
OMNIVIEW_AUTH_REQUIRED is off (the escape hatch).
"""

import pytest
from django.contrib.auth.models import User

from apps.admin_portal.models import AppAccess

pytestmark = pytest.mark.django_db

APP_URL = '/api/expense-tracker/budgets/yaml?bank=Golden1'
PORTAL_URL = '/api/admin-portal/users'


@pytest.fixture
def auth_on(settings):
    settings.OMNIVIEW_AUTH_REQUIRED = True


@pytest.fixture
def user(db):
    return User.objects.create_user(username='member', password='member-pass-9')


@pytest.fixture
def staff(db):
    return User.objects.create_user(username='boss', password='boss-pass-9', is_staff=True)


class TestAppAccessAuth:
    def test_anonymous_401s(self, auth_on, client, golden1_data):
        assert client.get(APP_URL).status_code == 401

    def test_signed_in_without_grant_403s(self, auth_on, client, user, golden1_data):
        client.force_login(user)
        response = client.get(APP_URL)
        assert response.status_code == 403
        assert response.json()['detail'] == 'You do not have access to this app.'

    def test_granted_user_200s(self, auth_on, client, user, golden1_data):
        AppAccess.objects.create(user=user, app_id='expense-tracker')
        client.force_login(user)
        assert client.get(APP_URL).status_code == 200

    def test_staff_bypasses_grants(self, auth_on, client, staff, golden1_data):
        client.force_login(staff)
        assert client.get(APP_URL).status_code == 200

    def test_flag_off_passes_everything(self, client, golden1_data):
        # No auth_on fixture: test settings pin the flag off.
        assert client.get(APP_URL).status_code == 200


class TestAdminAuth:
    def test_anonymous_401s(self, auth_on, client):
        assert client.get(PORTAL_URL).status_code == 401

    def test_non_staff_403s(self, auth_on, client, user):
        client.force_login(user)
        response = client.get(PORTAL_URL)
        assert response.status_code == 403
        assert response.json()['detail'] == 'Admin access required.'

    def test_staff_200s(self, auth_on, client, staff):
        client.force_login(staff)
        assert client.get(PORTAL_URL).status_code == 200

    def test_flag_off_passes(self, client, db):
        assert client.get(PORTAL_URL).status_code == 200
