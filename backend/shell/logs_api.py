"""
Frontend log ingestion at /api/logs/frontend: the SPA's error boundaries and
window error/unhandledrejection listeners POST here so browser-side failures
land in the same backend log stream (docker logs / LOG_DIR).

Unlike auth_api, this router does NOT opt out of the API-wide auth
(SessionAuthWhenRequired): when OMNIVIEW_AUTH_REQUIRED is on, anonymous
POSTs 401 - the ingestion surface is not a public write endpoint. Field
length caps (enforced by the Schema -> 422) keep a runaway client from
flooding the log with megabyte payloads.
"""

import logging
from typing import Literal

from ninja import Field, Router, Schema
from ninja.responses import Status

logger = logging.getLogger('omniview.frontend')

router = Router(tags=['logs'])

_LEVELS = {
    'debug': logging.DEBUG,
    'info': logging.INFO,
    'warn': logging.WARNING,
    'error': logging.ERROR,
}


class FrontendLogIn(Schema):
    level: Literal['debug', 'info', 'warn', 'error']
    message: str = Field(min_length=1, max_length=4000)
    # Where the entry came from, e.g. "shell-error-boundary" or "window.onerror".
    source: str = Field(default='', max_length=200)
    url: str = Field(default='', max_length=2000)
    stack: str = Field(default='', max_length=8000)


@router.post('/frontend', response={204: None})
def ingest_frontend_log(request, payload: FrontendLogIn):
    username = request.user.username if request.user.is_authenticated else 'anonymous'
    logger.log(
        _LEVELS[payload.level],
        '[%s] user=%s url=%s %s%s',
        payload.source or 'frontend',
        username,
        payload.url or '-',
        payload.message,
        f'\n{payload.stack}' if payload.stack else '',
    )
    return Status(204, None)
