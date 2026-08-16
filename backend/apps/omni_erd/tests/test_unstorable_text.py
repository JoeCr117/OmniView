"""Text the wire format allows and Postgres cannot store must 422, not 500.

Both endpoints here write caller-supplied strings into a JSONField. A NUL
character has no Postgres text representation and an unpaired surrogate has no
UTF-8 encoding, so either one raises `DataError` from psycopg during the INSERT -
after every service rule has passed, and outside django-ninja's error handling,
which renders it as a 500 with a traceback.

Found by fuzzing the OpenAPI schema (quality/reports/baseline-audit.md, D1); the
guard is `schemas.StorableText`. The override endpoint is where it was observed;
the layout endpoint is the same defect reached by a different door, because
`services._clean_positions` bounds how many keys a layout has and never what
they contain.
"""

import pytest
from django.contrib.auth.models import User

from apps.admin_portal.models import AppAccess

NUL = 'has\x00nul'
LONE_SURROGATE = 'has\ud800surrogate'

OVERRIDES_URL = '/api/omni-erd/admin/overrides'
LAYOUT_URL = '/api/omni-erd/layouts/pg-datavault/datavault'

VALID_OVERRIDE = {
    'source_id': 'pg-datavault',
    'namespace': 'datavault',
    'source_entity': 'datavault.gold_Golden1_AllTransactions',
    'source_columns': ['datesk'],
    'target_entity': 'datavault.gold_DimDate',
    'target_columns': ['datesk'],
    'action': 'join',
}


@pytest.fixture(autouse=True)
def auth_on(settings):
    settings.OMNIVIEW_AUTH_REQUIRED = True


@pytest.fixture
def staff_client(client, db):
    client.force_login(
        User.objects.create_user(username='boss', password='correct-horse-battery-9', is_staff=True)
    )
    return client


@pytest.fixture
def granted_client(client, db):
    user = User.objects.create_user(username='mapper', password='correct-horse-battery-9')
    AppAccess.objects.create(user=user, app_id='omni-erd')
    client.force_login(user)
    return client


def post_override(client, **overrides):
    return client.post(
        OVERRIDES_URL, data=VALID_OVERRIDE | overrides, content_type='application/json'
    )


class TestOverrideRejectsUnstorableText:
    @pytest.mark.parametrize('bad', [NUL, LONE_SURROGATE], ids=['nul', 'lone-surrogate'])
    @pytest.mark.parametrize(
        'field', ['source_entity', 'target_entity', 'note'], ids=lambda f: f.replace('_', '-')
    )
    def test_a_bad_scalar_field_422s(self, staff_client, field, bad):
        assert post_override(staff_client, **{field: bad}).status_code == 422

    @pytest.mark.parametrize('bad', [NUL, LONE_SURROGATE], ids=['nul', 'lone-surrogate'])
    def test_a_bad_column_name_422s(self, staff_client, bad):
        """The observed failure: the offending value was inside a column list."""
        assert post_override(staff_client, source_columns=[bad]).status_code == 422

    def test_the_valid_payload_still_passes_validation(self, staff_client):
        """Guards the guard - a 422 here would mean StorableText rejects real input."""
        assert post_override(staff_client).status_code != 422


class TestLayoutRejectsUnstorableText:
    @pytest.mark.parametrize('bad', [NUL, LONE_SURROGATE], ids=['nul', 'lone-surrogate'])
    def test_a_bad_position_key_422s(self, granted_client, bad):
        response = granted_client.put(
            LAYOUT_URL,
            data={'positions': {bad: {'x': 1.0, 'y': 2.0}}},
            content_type='application/json',
        )

        assert response.status_code == 422

    @pytest.mark.parametrize('bad', [NUL, LONE_SURROGATE], ids=['nul', 'lone-surrogate'])
    def test_a_bad_view_state_key_422s(self, granted_client, bad):
        response = granted_client.put(
            LAYOUT_URL,
            data={
                'positions': {},
                'view_state': {'default_mode': 'keys', 'overrides': {bad: 'all'}},
            },
            content_type='application/json',
        )

        assert response.status_code == 422
