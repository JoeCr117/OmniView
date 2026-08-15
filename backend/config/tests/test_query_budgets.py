"""A query count per endpoint, asserted.

The number of SQL statements a read endpoint issues is a fact about the code, not
a preference - and it is the fact that silently regresses. Dropping a
`select_related`, touching a related object inside a serializer or adding a field
that lazy-loads turns one query into one-per-row, and every functional test still
passes because the response body is unchanged.

The budgets below were MEASURED at adoption, not chosen. A failure here means the
query count moved: if it went up, something started lazy-loading; if it went down,
lower the budget in the same commit and say why.

Scope is read endpoints over seeded data - the ones a page actually waits on.
"""

import pytest
from django.contrib.auth.models import User
from django.test.utils import CaptureQueriesContext
from django.db import connections

pytestmark = pytest.mark.django_db(databases=['default', 'datavault'])


def queries_for(client, url: str, alias: str = 'datavault') -> int:
    with CaptureQueriesContext(connections[alias]) as captured:
        response = client.get(url)
    assert response.status_code == 200, f'{url} returned {response.status_code}'
    return len(captured)


@pytest.mark.parametrize(
    ('url', 'budget'),
    [
        ('/api/expense-tracker/dailymetrics?limit=10', 2),
        ('/api/expense-tracker/dailymetrics/summary', 1),
        ('/api/expense-tracker/transactions?limit=10', 2),
        ('/api/expense-tracker/transactions/uncategorized', 2),
    ],
)
def test_datavault_read_stays_within_its_query_budget(client, datavault_tables, url, budget):
    assert queries_for(client, url) <= budget


def test_admin_user_list_does_not_scale_queries_with_users(client, db):
    """The N+1 that `users_queryset`'s prefetch_related exists to prevent.

    Asserted as a *comparison between two row counts*, not a fixed number: that
    is what distinguishes "constant" from "small today". Deleting the prefetch
    makes the second call grow and this fails; nothing about the response body
    would change.
    """
    staff = User.objects.create_user('boss', 'boss@example.com', 'pw', is_staff=True)
    client.force_login(staff)

    with CaptureQueriesContext(connections['default']) as few:
        assert client.get('/api/admin-portal/users').status_code == 200

    User.objects.bulk_create(
        User(username=f'user{n}', email=f'user{n}@example.com') for n in range(25)
    )

    with CaptureQueriesContext(connections['default']) as many:
        assert client.get('/api/admin-portal/users').status_code == 200

    assert len(many) == len(few), (
        f'query count grew with row count ({len(few)} -> {len(many)}): '
        'the user list is issuing one query per user'
    )
