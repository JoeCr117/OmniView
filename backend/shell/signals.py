"""
Auth event logging via Django's built-in signals, connected in
CoreConfig.ready(). Signals are the single source of these log lines - they
fire for every login path (the /api/auth password endpoints, django-allauth
SSO, and /admin/), so the endpoints themselves must not also log.
"""

import logging

from django.contrib.auth.signals import (
    user_logged_in,
    user_logged_out,
    user_login_failed,
)
from django.dispatch import receiver

logger = logging.getLogger('omniview.auth')


@receiver(user_logged_in, dispatch_uid='omniview_log_login')
def log_user_logged_in(sender, request, user, **kwargs):
    logger.info('User %s logged in', user.get_username())


@receiver(user_logged_out, dispatch_uid='omniview_log_logout')
def log_user_logged_out(sender, request, user, **kwargs):
    # user is None when logout is called on an anonymous session.
    if user is not None:
        logger.info('User %s logged out', user.get_username())


@receiver(user_login_failed, dispatch_uid='omniview_log_login_failed')
def log_user_login_failed(sender, credentials, request, **kwargs):
    # credentials is sanitized by Django (password already masked out).
    logger.warning('Failed login attempt for username=%r', credentials.get('username'))
