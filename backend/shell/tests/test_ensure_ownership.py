"""`ensure_ownership` must be a safe no-op wherever the shared role is absent.

That is the whole of what the fast tier can assert: the reassignment path needs
a real Postgres with two roles and identity churn, which is a cloud condition.
What must never happen is this command erroring out during startup on a
single-owner deployment - it runs between `migrate` and gunicorn, and a
non-zero exit there would refuse to boot the app.
"""

from io import StringIO

from django.core.management import call_command

from shell.management.commands.ensure_ownership import OWNER_ROLE, SCHEMA


def test_it_skips_cleanly_on_a_non_postgres_backend(db):
    """The fast tier runs on SQLite. The command must notice and return, not
    emit Postgres-only SQL."""
    out = StringIO()
    call_command('ensure_ownership', stdout=out)

    assert 'Skipping ownership' in out.getvalue()
    assert 'not postgresql' in out.getvalue()


def test_it_targets_the_schema_django_owns_not_the_warehouse():
    """`datavault` is dbt's, reconciled by its own on-run-end hook. If this
    command pointed there too, the two would race on every rebuild."""
    assert SCHEMA == 'omniview'


def test_the_role_name_matches_the_dbt_macros_default():
    """The macro defaults to `omniview_owner` via `var('shared_owner_role', ...)`.
    If these two ever disagree, each half would hand objects to a different
    role and neither identity would hold all of them."""
    from pathlib import Path

    macro = (
        Path(__file__).resolve().parents[3]
        / 'pipelines'
        / 'expense_tracker'
        / 'dbt'
        / 'macros'
        / 'ensure_schema_ownership.sql'
    )
    assert OWNER_ROLE in macro.read_text(encoding='utf-8')
