"""Access control and layout ownership - the two things about this app that
would be a real problem to get wrong.

Graph endpoints are exercised against the source allowlist rather than a live
catalog; the fast tier deliberately stays off Postgres (see CLAUDE.md).
"""

import pytest
from django.contrib.auth.models import User

from apps.admin_portal.models import AppAccess

from ..models import ErdLayout

LAYOUT_URL = '/api/omni-erd/layouts/pg-datavault/datavault'

#: What a layout with no stored preference reads back as. Every GET carries a
#: view state, so the two halves of a saved diagram - where the cards are and how
#: tall they are - can never be restored independently of each other.
DEFAULT_VIEW = {'default_mode': 'keys', 'overrides': {}}


def layout(positions=None, view_state=None):
    """The full GET shape, so a test only has to state the part it cares about."""
    return {'positions': positions or {}, 'view_state': view_state or DEFAULT_VIEW}


@pytest.fixture
def auth_on(settings):
    settings.OMNIVIEW_AUTH_REQUIRED = True


@pytest.fixture
def granted_user(db):
    user = User.objects.create_user(username='mapper', password='correct-horse-battery-9')
    AppAccess.objects.create(user=user, app_id='omni-erd')
    return user


@pytest.fixture
def ungranted_user(db):
    return User.objects.create_user(username='outsider', password='correct-horse-battery-9')


def test_sources_lists_the_allowlist(client, db):
    response = client.get('/api/omni-erd/sources')

    assert response.status_code == 200
    ids = [source['id'] for source in response.json()]
    assert ids == ['pg-omniview', 'pg-datavault', 'databricks-uc']


def test_omni_erd_is_grantable(db):
    """It is a normal dashboard app, not a staff tool - so it must appear in the
    list an admin can grant from."""
    from shell.registry import GRANTABLE_APP_IDS

    assert 'omni-erd' in GRANTABLE_APP_IDS


def test_a_user_without_a_grant_is_refused(auth_on, client, ungranted_user):
    client.force_login(ungranted_user)

    assert client.get(LAYOUT_URL).status_code == 403


def test_a_granted_user_is_allowed(auth_on, client, granted_user):
    client.force_login(granted_user)

    response = client.get(LAYOUT_URL)

    assert response.status_code == 200
    assert response.json() == layout()


def test_staff_bypass_the_grant(auth_on, client, db):
    staff = User.objects.create_user(
        username='boss', password='correct-horse-battery-9', is_staff=True
    )
    client.force_login(staff)

    assert client.get(LAYOUT_URL).status_code == 200


def test_anonymous_is_refused_when_the_flag_is_on(auth_on, client, db):
    assert client.get(LAYOUT_URL).status_code == 401


def test_layouts_round_trip(auth_on, client, granted_user):
    client.force_login(granted_user)
    positions = {'datavault.gold_DimDate': {'x': 10.5, 'y': -20.0}}

    saved = client.put(LAYOUT_URL, data={'positions': positions}, content_type='application/json')
    assert saved.status_code == 204

    assert client.get(LAYOUT_URL).json() == layout(positions)


def test_saving_twice_updates_rather_than_duplicates(auth_on, client, granted_user):
    """The unique constraint is on (user, source, namespace); a second save must
    take the update_or_create path, not raise."""
    client.force_login(granted_user)
    for x in (1.0, 2.0):
        client.put(
            LAYOUT_URL,
            data={'positions': {'datavault.gold_DimDate': {'x': x, 'y': 0.0}}},
            content_type='application/json',
        )

    assert ErdLayout.objects.count() == 1
    assert client.get(LAYOUT_URL).json()['positions']['datavault.gold_DimDate']['x'] == 2.0


def test_one_users_layout_is_invisible_to_another(auth_on, client, granted_user, db):
    other = User.objects.create_user(username='someone-else', password='correct-horse-battery-9')
    AppAccess.objects.create(user=other, app_id='omni-erd')
    ErdLayout.objects.create(
        user=other,
        source_id='pg-datavault',
        namespace='datavault',
        positions={'datavault.gold_DimDate': {'x': 99.0, 'y': 99.0}},
    )

    client.force_login(granted_user)

    assert client.get(LAYOUT_URL).json() == layout()


def test_layouts_work_with_auth_disabled(client, db):
    """`OMNIVIEW_AUTH_REQUIRED=0` is a supported mode, and in it `request.user`
    is an AnonymousUser - which is not a row and cannot be a foreign key.

    Regression: both endpoints used to 500 on the FK assignment. Caught in a
    browser, not here, because every other test in this file authenticates.
    """
    # The test settings pin the flag off, so this is the default client.
    assert client.get(LAYOUT_URL).status_code == 200
    assert client.get(LAYOUT_URL).json() == layout()

    saved = client.put(
        LAYOUT_URL,
        data={'positions': {'datavault.gold_DimDate': {'x': 1.0, 'y': 2.0}}},
        content_type='application/json',
    )

    # Accepted and dropped: the drag has already happened, and a 4xx would
    # surface as an error for something the user did nothing wrong to cause.
    assert saved.status_code == 204
    assert not ErdLayout.objects.exists()


def test_unknown_sources_and_namespaces_404(auth_on, client, granted_user):
    client.force_login(granted_user)

    assert client.get('/api/omni-erd/layouts/nope/datavault').status_code == 404
    assert client.get('/api/omni-erd/layouts/pg-datavault/public').status_code == 404


def test_a_namespace_outside_the_allowlist_never_reaches_a_query(auth_on, client, granted_user):
    """The allowlist is the reason a client-supplied namespace is never
    interpolated into catalog SQL."""
    client.force_login(granted_user)

    response = client.get("/api/omni-erd/sources/pg-datavault/graph?namespace=pg_catalog")

    assert response.status_code == 404


@pytest.mark.parametrize(
    'bad_position',
    [
        {'x': 1},  # missing y - the case a bare dict[str, float] would let through
        {'x': 'abc', 'y': 2},  # not a number
        {},  # neither coordinate
        'not-a-mapping',
        None,
    ],
)
def test_a_malformed_layout_is_refused_whole(auth_on, client, granted_user, bad_position):
    """Rejected outright rather than partially saved. A layout PUT is the whole
    diagram: dropping the entries we couldn't parse would send a table back to
    its auto-layout position with no explanation."""
    client.force_login(granted_user)

    response = client.put(
        LAYOUT_URL,
        data={'positions': {'datavault.good': {'x': 1, 'y': 2}, 'datavault.bad': bad_position}},
        content_type='application/json',
    )

    assert response.status_code == 422
    assert not ErdLayout.objects.exists()


def test_extra_keys_on_a_position_are_ignored_not_rejected(auth_on, client, granted_user):
    """Only x and y mean anything. A client that sends more (a width it cached,
    say) is not malformed - it is just verbose, and forwards-compatibility is
    worth more here than strictness."""
    client.force_login(granted_user)

    response = client.put(
        LAYOUT_URL,
        data={'positions': {'datavault.good': {'x': 1, 'y': 2, 'width': 300}}},
        content_type='application/json',
    )

    assert response.status_code == 204
    assert client.get(LAYOUT_URL).json() == layout({'datavault.good': {'x': 1.0, 'y': 2.0}})


def test_view_state_round_trips(auth_on, client, granted_user):
    client.force_login(granted_user)
    view_state = {'default_mode': 'none', 'overrides': {'datavault.gold_DimDate': 'all'}}

    saved = client.put(
        LAYOUT_URL,
        data={'positions': {}, 'view_state': view_state},
        content_type='application/json',
    )
    assert saved.status_code == 204

    assert client.get(LAYOUT_URL).json()['view_state'] == view_state


def test_an_unknown_mode_is_refused(auth_on, client, granted_user):
    """A Literal, not a str: an unknown mode must never reach the JSONField,
    because the frontend would then have to defend against it on every read."""
    client.force_login(granted_user)

    response = client.put(
        LAYOUT_URL,
        data={'positions': {}, 'view_state': {'default_mode': 'sideways', 'overrides': {}}},
        content_type='application/json',
    )

    assert response.status_code == 422


def test_a_save_without_a_view_state_leaves_the_stored_one_alone(auth_on, client, granted_user):
    """A drag sends positions only. It must not silently reset how the user had
    collapsed their cards."""
    client.force_login(granted_user)
    client.put(
        LAYOUT_URL,
        data={'positions': {}, 'view_state': {'default_mode': 'all', 'overrides': {}}},
        content_type='application/json',
    )

    client.put(
        LAYOUT_URL,
        data={'positions': {'datavault.gold_DimDate': {'x': 5.0, 'y': 5.0}}},
        content_type='application/json',
    )

    body = client.get(LAYOUT_URL).json()
    assert body['view_state']['default_mode'] == 'all'
    assert body['positions'] == {'datavault.gold_DimDate': {'x': 5.0, 'y': 5.0}}


def test_a_row_predating_view_state_reads_as_the_default(auth_on, client, granted_user):
    """Rows written before the field existed hold `{}`, which is not a valid view
    state - an empty dict must never reach the response schema."""
    ErdLayout.objects.create(
        user=granted_user,
        source_id='pg-datavault',
        namespace='datavault',
        positions={'datavault.gold_DimDate': {'x': 1.0, 'y': 1.0}},
        view_state={},
    )
    client.force_login(granted_user)

    assert client.get(LAYOUT_URL).json()['view_state'] == DEFAULT_VIEW


def test_an_oversized_layout_is_truncated_rather_than_rejected(auth_on, client, granted_user):
    """The one thing Pydantic will accept unboundedly. Truncating beats storing a
    row nobody can load."""
    from ..services import MAX_POSITIONS

    client.force_login(granted_user)
    positions = {f'datavault.t{i}': {'x': float(i), 'y': 0.0} for i in range(MAX_POSITIONS + 50)}

    assert (
        client.put(
            LAYOUT_URL, data={'positions': positions}, content_type='application/json'
        ).status_code
        == 204
    )
    assert len(client.get(LAYOUT_URL).json()['positions']) == MAX_POSITIONS


def test_an_unconfigured_databricks_source_503s_with_a_reason(auth_on, client, granted_user):
    """It resolves and explains itself rather than pretending not to exist -
    the UI keys an empty state off the message."""
    client.force_login(granted_user)

    response = client.get('/api/omni-erd/sources/databricks-uc/graph?namespace=anything')

    # No namespaces are declared for it, so validation refuses before the
    # adapter is ever built.
    assert response.status_code == 404
