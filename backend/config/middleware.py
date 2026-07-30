"""
Request logging: a per-request ID (contextvar) stamped onto every log record
and echoed back as an X-Request-ID response header, plus one INFO line per
request with user and duration. Pure stdlib - no new dependencies.

Sits first in MIDDLEWARE so even requests short-circuited by later
middleware (e.g. CORS preflights) get an ID and a log line; request.user is
read after the response, by which point AuthenticationMiddleware has run
(getattr-guarded for short-circuited requests that never reached it).
"""

import contextvars
import logging
import time
import uuid

_request_id = contextvars.ContextVar('request_id', default='-')

logger = logging.getLogger('omniview.request')


class RequestIdFilter(logging.Filter):
    """Injects the current request's ID into every record ('-' outside one).

    Referenced by name from LOGGING in settings/base.py; attached to the
    console (and optional file) handler so third-party records get the
    attribute too.
    """

    def filter(self, record):
        record.request_id = _request_id.get()
        return True


class RequestLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Honor an inbound ID (reverse proxy / client retry correlation),
        # otherwise mint a short one.
        request_id = request.headers.get('X-Request-ID') or uuid.uuid4().hex[:12]
        token = _request_id.set(request_id)
        start = time.monotonic()
        try:
            response = self.get_response(request)
            duration_ms = (time.monotonic() - start) * 1000
            user = getattr(request, 'user', None)
            username = user.username if user is not None and user.is_authenticated else 'anonymous'
            logger.info(
                '%s %s -> %s user=%s %.0fms',
                request.method,
                request.get_full_path(),
                response.status_code,
                username,
                duration_ms,
            )
            response['X-Request-ID'] = request_id
            return response
        finally:
            _request_id.reset(token)
