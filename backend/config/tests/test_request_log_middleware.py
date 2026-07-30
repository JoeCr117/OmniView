"""
RequestLogMiddleware: every response carries X-Request-ID (minted or echoed),
one INFO line per request is emitted under omniview.request, and
RequestIdFilter stamps records emitted during the request with that ID
('-' outside any request).
"""

import logging

from django.http import HttpResponse

from config.middleware import RequestIdFilter, RequestLogMiddleware

CONFIG_URL = '/api/auth/config'


def test_response_carries_minted_request_id(client, db):
    response = client.get(CONFIG_URL)
    assert response.status_code == 200
    assert len(response['X-Request-ID']) == 12


def test_inbound_request_id_is_echoed(client, db):
    response = client.get(CONFIG_URL, headers={'x-request-id': 'proxy-rid-42'})
    assert response['X-Request-ID'] == 'proxy-rid-42'


def test_one_info_line_per_request_with_user_and_duration(client, db, caplog):
    with caplog.at_level(logging.INFO, logger='omniview.request'):
        client.get(CONFIG_URL)
    lines = [r for r in caplog.records if r.name == 'omniview.request']
    assert len(lines) == 1
    message = lines[0].getMessage()
    assert f'GET {CONFIG_URL} -> 200 user=anonymous' in message
    assert message.endswith('ms')


def test_filter_stamps_records_emitted_inside_the_request(rf, caplog):
    caplog.handler.addFilter(RequestIdFilter())
    try:
        middleware = RequestLogMiddleware(lambda request: HttpResponse())
        with caplog.at_level(logging.INFO, logger='omniview.request'):
            middleware(rf.get('/anything', headers={'x-request-id': 'rid-123'}))
        assert caplog.records[-1].request_id == 'rid-123'
    finally:
        caplog.handler.filters.clear()


def test_filter_defaults_to_dash_outside_requests():
    record = logging.LogRecord('x', logging.INFO, __file__, 1, 'msg', (), None)
    assert RequestIdFilter().filter(record) is True
    assert record.request_id == '-'
