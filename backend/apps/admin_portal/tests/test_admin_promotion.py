"""
OMNIVIEW_ADMIN_EMAILS auto-promotion via ForwardedEmailBackend.configure_user
(the hook Databricks header sign-ins run through).
"""

import pytest
from django.contrib.auth.models import User
from shell.remote_auth import ForwardedEmailBackend

pytestmark = pytest.mark.django_db


def _configure(user, created=True):
    return ForwardedEmailBackend().configure_user(request=None, user=user, created=created)


def test_matching_email_is_promoted_case_insensitively(settings):
    settings.OMNIVIEW_ADMIN_EMAILS = ['boss@example.com']
    user = User.objects.create_user(username='Boss@Example.com')
    _configure(user)
    user.refresh_from_db()
    assert user.is_staff is True
    assert user.email == 'Boss@Example.com'  # created path still mirrors email


def test_non_matching_email_stays_regular(settings):
    settings.OMNIVIEW_ADMIN_EMAILS = ['boss@example.com']
    user = User.objects.create_user(username='member@example.com')
    _configure(user)
    user.refresh_from_db()
    assert user.is_staff is False


def test_existing_user_promoted_on_relogin(settings):
    # created=False: the env list was extended after this user first signed in.
    settings.OMNIVIEW_ADMIN_EMAILS = ['late@example.com']
    user = User.objects.create_user(username='late@example.com', email='late@example.com')
    _configure(user, created=False)
    user.refresh_from_db()
    assert user.is_staff is True


def test_never_demotes(settings):
    settings.OMNIVIEW_ADMIN_EMAILS = []
    user = User.objects.create_user(username='boss@example.com', is_staff=True)
    _configure(user, created=False)
    user.refresh_from_db()
    assert user.is_staff is True
