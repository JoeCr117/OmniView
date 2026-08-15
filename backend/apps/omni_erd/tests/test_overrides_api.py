"""The privilege boundary around the override endpoints.

Every other route in this app is behind `AppAccessAuth('omni-erd')`, which grants
*use* of the app. An override is global and asserts a fact about the schema, so
writing one takes staff - and the nested `admin_router` carrying its own
`AdminAuth` is the whole of that guarantee. `Router.add_router` assigns auth to
the child in place, so a boundary declared at the mount is one another module can
silently undo; these tests are what would notice.

The refusal *message* is asserted, not just the status code. `AppAccessAuth` and
`AdminAuth` both 403, so only the wording proves which one ran: a granted
non-staff user refused with 'You do not have access to this app.' would mean the
admin check never engaged and the parent router happened to refuse for its own
reasons.
"""

import pytest
from config.api import api
from django.contrib.auth.models import User
from django.core.cache import cache
from ninja.utils import normalize_path
from shell.security import AdminAuth, AppAccessAuth

from apps.admin_portal.models import AppAccess

from .. import sources as sources_module
from ..models import ErdRelationshipOverride
from .fixtures import FakeIntrospector, all_transactions, dim_date

OVERRIDES_URL = '/api/omni-erd/admin/overrides?source_id=pg-datavault&namespace=datavault'
ONE_OVERRIDE_URL = '/api/omni-erd/admin/overrides/1?source_id=pg-datavault&namespace=datavault'

ADMIN_ONLY = 'Admin access required.'

PAYLOAD = {
    'source_id': 'pg-datavault',
    'namespace': 'datavault',
    'source_entity': 'datavault.gold_Golden1_AllTransactions',
    'source_columns': ['datesk'],
    'target_entity': 'datavault.gold_DimDate',
    'target_columns': ['datesk'],
    'action': 'join',
}


@pytest.fixture(autouse=True)
def clean_graph_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def auth_on(settings):
    settings.OMNIVIEW_AUTH_REQUIRED = True


@pytest.fixture
def catalog(monkeypatch):
    """`build_graph` introspects Postgres, which the in-memory fast tier has no
    `pg_class` for. Only the endpoints that read the catalog need this."""
    monkeypatch.setattr(
        sources_module,
        'PostgresIntrospector',
        lambda **kwargs: FakeIntrospector([all_transactions(), dim_date()]),
    )


@pytest.fixture
def granted_user(db):
    """Holds a real grant for this app - so a 403 here can only have come from the
    staff requirement, not from the app-access check."""
    user = User.objects.create_user(username='mapper', password='correct-horse-battery-9')
    AppAccess.objects.create(user=user, app_id='omni-erd')
    return user


@pytest.fixture
def staff(db):
    return User.objects.create_user(
        username='boss', password='correct-horse-battery-9', is_staff=True
    )


def post(client):
    return client.post(
        '/api/omni-erd/admin/overrides', data=PAYLOAD, content_type='application/json'
    )


def put(client):
    return client.put(ONE_OVERRIDE_URL, data=PAYLOAD, content_type='application/json')


class TestAnonymousIsRefused:
    def test_get_401s(self, auth_on, client, db):
        assert client.get(OVERRIDES_URL).status_code == 401

    def test_post_401s(self, auth_on, client, db):
        assert post(client).status_code == 401

    def test_put_401s(self, auth_on, client, db):
        assert put(client).status_code == 401

    def test_delete_401s(self, auth_on, client, db):
        assert client.delete(ONE_OVERRIDE_URL).status_code == 401


class TestAGrantIsNotAdmin:
    """A user who may open the diagram may not rewrite what it claims."""

    def test_get_403s_with_the_admin_message(self, auth_on, client, granted_user):
        client.force_login(granted_user)

        response = client.get(OVERRIDES_URL)

        assert response.status_code == 403
        assert response.json()['detail'] == ADMIN_ONLY

    def test_post_403s_with_the_admin_message(self, auth_on, client, granted_user):
        client.force_login(granted_user)

        response = post(client)

        assert response.status_code == 403
        assert response.json()['detail'] == ADMIN_ONLY

    def test_put_403s_with_the_admin_message(self, auth_on, client, granted_user):
        client.force_login(granted_user)

        response = put(client)

        assert response.status_code == 403
        assert response.json()['detail'] == ADMIN_ONLY

    def test_delete_403s_with_the_admin_message(self, auth_on, client, granted_user):
        client.force_login(granted_user)

        response = client.delete(ONE_OVERRIDE_URL)

        assert response.status_code == 403
        assert response.json()['detail'] == ADMIN_ONLY

    def test_a_refused_write_creates_nothing(self, auth_on, client, granted_user):
        """The status code alone would still pass if the handler ran and then
        something else returned 403."""
        client.force_login(granted_user)

        post(client)

        assert not ErdRelationshipOverride.objects.exists()

    def test_a_refused_delete_removes_nothing(self, auth_on, client, granted_user, catalog):
        existing = ErdRelationshipOverride.objects.create(
            source_id='pg-datavault',
            namespace='datavault',
            entity_a='datavault.gold_DimDate',
            entity_b='datavault.gold_Golden1_AllTransactions',
            action='join',
            columns_a=['datesk'],
            columns_b=['datesk'],
            many_side='b',
        )
        client.force_login(granted_user)

        response = client.delete(
            f'/api/omni-erd/admin/overrides/{existing.pk}'
            '?source_id=pg-datavault&namespace=datavault'
        )

        assert response.status_code == 403
        assert ErdRelationshipOverride.objects.filter(pk=existing.pk).exists()


class TestStaffGetThrough:
    def test_staff_may_read_the_list(self, auth_on, client, staff, catalog):
        client.force_login(staff)

        response = client.get(OVERRIDES_URL)

        assert response.status_code == 200
        assert response.json() == []

    def test_staff_may_write(self, auth_on, client, staff):
        client.force_login(staff)

        response = post(client)

        assert response.status_code == 200
        assert ErdRelationshipOverride.objects.count() == 1
        assert ErdRelationshipOverride.objects.get().pk == response.json()['id']

    def test_a_staff_write_records_them_as_the_author(self, auth_on, client, staff):
        client.force_login(staff)

        post(client)

        assert ErdRelationshipOverride.objects.get().created_by == staff

    def test_staff_reach_the_handler_on_a_missing_row_rather_than_the_auth_wall(
        self, auth_on, client, staff
    ):
        """404, not 403: proof the request got past auth and into the service,
        which is what makes the 403s above mean something."""
        client.force_login(staff)

        assert client.delete(ONE_OVERRIDE_URL).status_code == 404


def test_every_bound_operation_carries_the_expected_auth_class():
    """The tests above prove `AdminAuth` guards the four override endpoints. They
    would not notice a *fifth* override endpoint added to `router` instead of
    `admin_router` - it would silently inherit `AppAccessAuth` and hand a schema
    write to every granted user, and every test above would keep passing. This
    walks the live NinjaAPI's bound routers and asserts the whole path/method ->
    auth-class mapping under /api/omni-erd/, so an unexpected operation appearing
    anywhere in that surface fails here instead of shipping unnoticed."""
    expected = {
        ('GET', '/api/omni-erd/sources'): AppAccessAuth,
        ('GET', '/api/omni-erd/sources/{source_id}/graph'): AppAccessAuth,
        ('GET', '/api/omni-erd/layouts/{source_id}/{namespace}'): AppAccessAuth,
        ('PUT', '/api/omni-erd/layouts/{source_id}/{namespace}'): AppAccessAuth,
        ('GET', '/api/omni-erd/admin/overrides'): AdminAuth,
        ('POST', '/api/omni-erd/admin/overrides'): AdminAuth,
        ('PUT', '/api/omni-erd/admin/overrides/{override_id}'): AdminAuth,
        ('DELETE', '/api/omni-erd/admin/overrides/{override_id}'): AdminAuth,
    }

    actual = {}
    for bound_router in api._get_bound_routers():
        for path, path_view in bound_router.path_operations.items():
            full_path = normalize_path(f'/api/{bound_router.prefix}/{path}')
            if not full_path.startswith('/api/omni-erd'):
                continue
            for operation in path_view.operations:
                for method in operation.methods:
                    actual[(method, full_path)] = type(operation.auth_callbacks[0])

    assert actual == expected


def test_the_check_stands_down_with_the_flag_off(client, db, catalog):
    """`OMNIVIEW_AUTH_REQUIRED=0` is the documented local-work escape hatch, and
    it disengages here exactly as it does everywhere else in the shell."""
    # The test settings pin the flag off, so this is the default client.
    response = client.get(OVERRIDES_URL)

    assert response.status_code == 200
    assert response.json() == []
