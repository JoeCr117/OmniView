import pytest

from config.frontend import LEGACY_REDIRECTS


@pytest.mark.parametrize('page', sorted(LEGACY_REDIRECTS))
def test_legacy_page_urls_301_to_the_app_namespace(client, page):
    """Assert against the registry's own mapping rather than a hardcoded app id:
    a legacy page belongs to whichever app declares it, and api-docs has already
    moved once (ExpenseTracker -> Admin Portal)."""
    response = client.get(f'/{page}')
    assert response.status_code == 301
    assert response['Location'] == LEGACY_REDIRECTS[page]


def test_legacy_redirects_cover_every_pre_omniview_page():
    assert LEGACY_REDIRECTS == {
        'check-book': '/apps/expense-tracker/check-book',
        'daily-trends': '/apps/expense-tracker/daily-trends',
        'uncategorized': '/apps/expense-tracker/uncategorized',
        'budget-map': '/apps/expense-tracker/budget-map',
        'raw-csvs': '/apps/expense-tracker/raw-csvs',
        # Documents the whole OmniView API, so it lives in the Admin Portal.
        'api-docs': '/apps/admin-portal/api-docs',
    }


def test_unknown_resource_404s(client):
    # FRONTEND_EXPORT_DIR points at a nonexistent sentinel under test
    # settings, so anything that isn't a redirect misses and 404s.
    assert client.get('/no-such-page').status_code == 404
