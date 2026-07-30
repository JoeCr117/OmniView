"""The registry is the backend's only list of apps - and half of a contract.

The other half is frontend/src/apps/registry.ts, which can't be generated from
here (it carries icons and nav) or vice versa. So the two are asserted to agree
on the one thing that matters: the set of app ids, which is simultaneously the
URL namespace, the API namespace, and the AppAccess grant key. A new app that
lands on only one side fails here.
"""

import re
from pathlib import Path

import pytest
from django.conf import settings

from shell.registry import (
    APPS_BY_ID,
    DATAVAULT_APPS,
    DJANGO_APPS,
    GRANTABLE_APP_IDS,
    LEGACY_REDIRECTS,
    OMNIVIEW_APPS,
)

FRONTEND_REGISTRY = settings.REPO_ROOT / 'frontend' / 'src' / 'apps' / 'registry.ts'


def _frontend_app_ids() -> set[str]:
    """The `id:` of every entry in the frontend's APPS array."""
    source = FRONTEND_REGISTRY.read_text(encoding='utf-8')
    return set(re.findall(r'^\s*id:\s*"([a-z0-9-]+)"', source, re.MULTILINE))


@pytest.mark.skipif(
    not FRONTEND_REGISTRY.is_file(),
    reason='frontend/ is not present (deploy bundle ships only the built export)',
)
def test_backend_and_frontend_registries_agree_on_app_ids():
    assert _frontend_app_ids() == set(APPS_BY_ID)


def test_app_ids_are_unique_and_kebab_case():
    ids = [app.id for app in OMNIVIEW_APPS]
    assert len(ids) == len(set(ids))
    assert all(re.fullmatch(r'[a-z0-9]+(-[a-z0-9]+)*', app_id) for app_id in ids)


def test_admin_only_apps_are_never_grantable():
    """An admin_only app is gated by AdminAuth, so a grant row for it would be a
    silent no-op - and worse, would look like access in the Users tab."""
    for app in OMNIVIEW_APPS:
        assert app.admin_only is not (app.id in GRANTABLE_APP_IDS)


def test_installed_apps_come_from_the_registry():
    for dotted in DJANGO_APPS:
        assert dotted in settings.INSTALLED_APPS


def test_datavault_labels_belong_to_registered_apps():
    declared = {label for app in OMNIVIEW_APPS for label in app.datavault_labels}
    assert DATAVAULT_APPS == declared


def test_legacy_redirects_point_into_their_app():
    for page, target in LEGACY_REDIRECTS.items():
        app_id = target.split('/')[2]
        assert app_id in APPS_BY_ID
        assert target == f'/apps/{app_id}/{page}'
