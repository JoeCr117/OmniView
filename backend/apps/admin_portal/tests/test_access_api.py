"""
Users & Access management API (all requests as staff; enforcement itself is
covered in test_enforcement.py). Suite runs with OMNIVIEW_AUTH_REQUIRED off,
so no login plumbing is needed except where identity matters (self-demotion)
- those force_login a staff user.
"""

import pytest
from django.contrib.auth.models import User

from apps.admin_portal.models import AppAccess

pytestmark = pytest.mark.django_db


@pytest.fixture
def staff(db):
    return User.objects.create_user(username='boss', password='boss-pass-9', is_staff=True)


@pytest.fixture
def member(db):
    return User.objects.create_user(
        username='member', password='member-pass-9', email='member@example.com'
    )


def test_users_list_includes_app_ids(client, staff, member):
    AppAccess.objects.create(user=member, app_id='expense-tracker', granted_by=staff)
    body = client.get('/api/admin-portal/users').json()
    by_name = {u['username']: u for u in body['items']}
    assert by_name['member']['app_ids'] == ['expense-tracker']
    assert by_name['member']['is_staff'] is False
    assert by_name['boss']['app_ids'] == []
    assert by_name['boss']['is_staff'] is True
    assert body['count'] == 2


def test_users_list_q_filter(client, staff, member):
    body = client.get('/api/admin-portal/users?q=member@').json()
    assert [u['username'] for u in body['items']] == ['member']


def test_grant_is_idempotent_and_records_granted_by(client, staff, member):
    client.force_login(staff)
    url = f'/api/admin-portal/users/{member.pk}/apps/expense-tracker'
    assert client.post(url).status_code == 204
    assert client.post(url).status_code == 204
    access = AppAccess.objects.get(user=member, app_id='expense-tracker')
    assert access.granted_by == staff


def test_grant_unknown_app_422s(client, staff, member):
    assert client.post(f'/api/admin-portal/users/{member.pk}/apps/nope').status_code == 422


def test_grant_unknown_user_404s(client, staff):
    assert client.post('/api/admin-portal/users/99999/apps/expense-tracker').status_code == 404


def test_revoke_is_idempotent(client, staff, member):
    AppAccess.objects.create(user=member, app_id='expense-tracker')
    url = f'/api/admin-portal/users/{member.pk}/apps/expense-tracker'
    assert client.delete(url).status_code == 204
    assert not AppAccess.objects.filter(user=member).exists()
    assert client.delete(url).status_code == 204


def test_promote_and_demote(client, staff, member):
    client.force_login(staff)
    url = f'/api/admin-portal/users/{member.pk}/admin'
    body = client.post(url, data={'is_staff': True}, content_type='application/json').json()
    assert body['is_staff'] is True
    member.refresh_from_db()
    assert member.is_staff is True
    body = client.post(url, data={'is_staff': False}, content_type='application/json').json()
    assert body['is_staff'] is False


def test_self_demotion_422s(client, staff):
    client.force_login(staff)
    response = client.post(
        f'/api/admin-portal/users/{staff.pk}/admin',
        data={'is_staff': False},
        content_type='application/json',
    )
    assert response.status_code == 422
    staff.refresh_from_db()
    assert staff.is_staff is True


def test_me_exposes_app_ids(client, member):
    AppAccess.objects.create(user=member, app_id='expense-tracker')
    client.force_login(member)
    assert client.get('/api/auth/me').json()['app_ids'] == ['expense-tracker']
