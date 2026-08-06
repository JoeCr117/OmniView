"""What the service layer promises about a stored override.

Three things here would be quietly wrong in production if they broke: the
canonical pair must survive a round trip through storage without losing the
admin's chosen direction, staleness must be derived on every read rather than
remembered, and an override written with nobody signed in must not try to make an
AnonymousUser a foreign key.

The fast tier has no `pg_class`, so `build_graph` is pointed at a
`FakeIntrospector` rather than a live catalog. Everything downstream of it - the
cache, inference, override resolution - is the real code path.
"""

import pytest
from django.contrib.auth.models import AnonymousUser, User
from django.core.cache import cache
from ninja.errors import HttpError

from .. import services as services_module
from .. import sources as sources_module
from ..models import ErdRelationshipOverride
from ..services import (
    CanonicalPair,
    build_graph,
    canonical_pair,
    list_overrides,
    override_status,
    override_to_ir,
    save_override,
    update_override,
)
from .fixtures import FakeIntrospector, all_transactions, column, dim_date, entity

pytestmark = pytest.mark.django_db

SOURCE_ID = 'pg-datavault'
NAMESPACE = 'datavault'

#: Who writes an override when `OMNIVIEW_AUTH_REQUIRED` is off - the escape hatch
#: the audit fields have to survive.
NOBODY = AnonymousUser()


@pytest.fixture(autouse=True)
def clean_graph_cache():
    """`build_graph` caches for a minute, which outlives a test."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def catalog(monkeypatch):
    """Serve `pg-datavault` from a hand-built catalog a test can change mid-test.

    Mutating `catalog['entities']` is how "the table came back" is expressed:
    the next `build_graph` reads the list as it stands then.
    """
    state = {'entities': [all_transactions(), dim_date()]}
    monkeypatch.setattr(
        sources_module,
        'PostgresIntrospector',
        lambda **kwargs: FakeIntrospector(state['entities']),
    )
    return state


def stored_row(**kwargs) -> ErdRelationshipOverride:
    """An unsaved row, so the round-trip pair can be exercised without a write."""
    fields = {
        'source_id': SOURCE_ID,
        'namespace': NAMESPACE,
        'entity_a': 'datavault.a_fact',
        'entity_b': 'datavault.z_dim',
        'action': 'join',
        'columns_a': ['datesk'],
        'columns_b': ['datesk'],
        'many_side': 'a',
        **kwargs,
    }
    return ErdRelationshipOverride(**fields)


def ends_of(override):
    return (
        override.source.entity,
        override.source.columns,
        override.target.entity,
        override.target.columns,
    )


def a_join(**kwargs):
    """The keyword half of a `save_override` call, so a test states only the part
    it is about."""
    return {
        'source_entity': 'datavault.gold_Golden1_AllTransactions',
        'source_columns': ['datesk'],
        'target_entity': 'datavault.gold_DimDate',
        'target_columns': ['datesk'],
        'action': 'join',
        **kwargs,
    }


class TestCanonicalRoundTrip:
    """`canonical_pair` claims to be the exact inverse of `override_to_ir`. If it
    is not, an edit rewrites the row it read and the admin's chosen direction
    flips underneath them."""

    def test_a_row_whose_source_sorts_first_round_trips_unchanged(self):
        row = stored_row(many_side='a', columns_a=['datesk'], columns_b=['datesk'])

        assert canonical_pair(*ends_of(override_to_ir(row))) == CanonicalPair(
            row.entity_a, row.entity_b, row.columns_a, row.columns_b, 'a'
        )

    def test_a_row_whose_source_sorts_second_round_trips_unchanged(self):
        """`many_side='b'` is the case the ordered storage exists to survive: the
        referencing side is the *second* entity alphabetically."""
        row = stored_row(many_side='b', columns_a=['datesk'], columns_b=['transactionsk'])

        assert canonical_pair(*ends_of(override_to_ir(row))) == CanonicalPair(
            row.entity_a, row.entity_b, row.columns_a, row.columns_b, 'b'
        )

    def test_the_directed_ends_swap_with_many_side(self):
        """The two directions must not read back the same, or `many_side` would be
        carrying nothing."""
        a_side = override_to_ir(stored_row(many_side='a'))
        b_side = override_to_ir(stored_row(many_side='b'))

        assert a_side.source.entity == 'datavault.a_fact'
        assert b_side.source.entity == 'datavault.z_dim'


class TestDerivedStatus:
    def test_an_override_naming_a_departed_entity_reads_as_unknown_entity(self, catalog):
        save_override(NOBODY, SOURCE_ID, NAMESPACE, **a_join())
        catalog['entities'] = [all_transactions()]

        [listed] = list_overrides(SOURCE_ID, NAMESPACE)

        assert listed['status'] == 'unknown_entity'
        assert 'datavault.gold_DimDate' in listed['detail']

    def test_the_same_row_reads_active_again_once_the_entity_is_back(self, catalog):
        """Staleness is derived, never stored. A stored flag is a cache with no
        invalidation: the rebuild that restores the table does not come back to
        clear it, so the row would read stale forever while the diagram drew it
        correctly.

        The `cache.clear()` stands in for `GRAPH_CACHE_TTL_SECONDS` elapsing -
        the graph, not the status, is what is cached, and a minute is the
        documented window. It clears nothing on the row, so a stored flag would
        still fail this.
        """
        save_override(NOBODY, SOURCE_ID, NAMESPACE, **a_join())
        catalog['entities'] = [all_transactions()]
        assert list_overrides(SOURCE_ID, NAMESPACE)[0]['status'] == 'unknown_entity'
        row_id = ErdRelationshipOverride.objects.get().pk

        catalog['entities'] = [all_transactions(), dim_date()]
        cache.clear()

        [listed] = list_overrides(SOURCE_ID, NAMESPACE)
        assert listed['id'] == row_id
        assert listed['status'] == 'active'
        assert listed['detail'] == ''

    def test_status_is_read_off_the_catalog_in_hand_not_off_the_row(self):
        """The same unchanged override, judged against two catalogs. Nothing on
        the row differs between the two answers - which is the point."""
        row = stored_row(entity_a='datavault.gold_DimDate', entity_b='datavault.gold_Ledger')
        override = override_to_ir(row)
        dates = dim_date()
        ledger = entity('gold_Ledger', [column('datesk')])

        assert override_status(override, {dates.id: dates}) == (
            'unknown_entity',
            'datavault.gold_Ledger is not in this diagram',
        )
        assert override_status(override, {dates.id: dates, ledger.id: ledger}) == ('active', '')

    def test_a_listed_override_reads_back_directed_as_the_admin_wrote_it(self, catalog):
        """How the row orders its pair is storage's business. The admin must see
        back the assertion they made, not its canonical form."""
        save_override(
            NOBODY,
            SOURCE_ID,
            NAMESPACE,
            **a_join(
                source_entity='datavault.gold_DimDate',
                target_entity='datavault.gold_Golden1_AllTransactions',
            ),
        )

        [listed] = list_overrides(SOURCE_ID, NAMESPACE)

        assert listed['source_entity'] == 'datavault.gold_DimDate'
        assert listed['target_entity'] == 'datavault.gold_Golden1_AllTransactions'


class TestGraphInvalidation:
    def test_a_write_reaches_the_next_graph_read(self, catalog):
        """The graph is cached for a minute, so a write that did not invalidate
        would leave the admin staring at a diagram their own edit is missing
        from."""
        before = build_graph(SOURCE_ID, NAMESPACE)
        assert [edge.origin for edge in before.relationships] == ['inferred_naming']

        moved = a_join(source_columns=['amount'], target_columns=['year'])
        save_override(NOBODY, SOURCE_ID, NAMESPACE, **moved)

        after = build_graph(SOURCE_ID, NAMESPACE)
        assert [edge.origin for edge in after.relationships] == ['admin_override']
        assert after.relationships[0].source.columns == ('amount',)


class TestRefusedAssertions:
    """An override is an admin stating a fact. A silently repaired assertion is
    worse than a refused one, because they walk away believing something else."""

    def refusal(self, **kwargs) -> HttpError:
        with pytest.raises(HttpError) as raised:
            save_override(NOBODY, SOURCE_ID, NAMESPACE, **a_join(**kwargs))
        return raised.value

    def test_a_join_pairing_two_columns_against_one_is_refused(self):
        assert self.refusal(source_columns=['a', 'b'], target_columns=['x']).status_code == 422

    def test_a_join_with_no_columns_is_refused(self):
        assert self.refusal(source_columns=[], target_columns=[]).status_code == 422

    def test_a_suppress_carrying_columns_is_refused(self):
        """A suppress names two entities and nothing else; columns on one would
        mean the admin thinks they asserted a join."""
        assert self.refusal(action='suppress').status_code == 422

    def test_a_join_repeating_a_column_pair_is_refused(self):
        """`a.x = b.y AND a.x = b.y` is redundant rather than invalid, so nothing
        downstream objects to it - which is exactly why it has to be refused
        here. De-duplicating it would be the silently repaired assertion."""
        error = self.refusal(
            source_columns=['datesk', 'datesk'], target_columns=['datesk', 'datesk']
        )

        assert error.status_code == 422
        assert 'datesk = datesk' in error.message

    def test_a_repeat_is_spotted_across_a_difference_in_case(self):
        """Columns resolve case-insensitively everywhere else in this app, so
        `DateSK` and `datesk` are one pair repeated, not two pairs."""
        error = self.refusal(
            source_columns=['datesk', 'DATESK'], target_columns=['datesk', 'DateSK']
        )

        assert error.status_code == 422

    def test_a_join_on_two_genuinely_different_pairs_is_accepted(self):
        """The composite key the duplicate rule must not catch."""
        row = save_override(
            NOBODY,
            SOURCE_ID,
            NAMESPACE,
            **a_join(source_columns=['datesk', 'amount'], target_columns=['datesk', 'year']),
        )

        assert row.pk is not None

    def test_an_entity_joined_to_itself_is_refused(self):
        error = self.refusal(target_entity='datavault.gold_Golden1_AllTransactions')

        assert error.status_code == 422

    def test_a_refused_assertion_writes_nothing(self):
        self.refusal(source_columns=['a', 'b'], target_columns=['x'])

        assert not ErdRelationshipOverride.objects.exists()


class TestAuditIdentity:
    def test_a_write_records_who_made_it(self):
        author = User.objects.create_user(username='boss', password='correct-horse-battery-9')

        row = save_override(author, SOURCE_ID, NAMESPACE, **a_join())

        assert row.created_by == author
        assert row.updated_by == author

    def test_a_write_with_nobody_signed_in_records_no_author(self):
        """`OMNIVIEW_AUTH_REQUIRED=0` is a supported mode, and in it `request.user`
        is an AnonymousUser - not a row, and so not assignable to a foreign key.
        The write must succeed with no author rather than 500."""
        row = save_override(AnonymousUser(), SOURCE_ID, NAMESPACE, **a_join())

        assert row.created_by is None
        assert row.updated_by is None

    def test_an_edit_leaves_the_original_author_alone(self):
        author = User.objects.create_user(username='first', password='correct-horse-battery-9')
        editor = User.objects.create_user(username='second', password='correct-horse-battery-9')
        save_override(author, SOURCE_ID, NAMESPACE, **a_join())

        moved = a_join(source_columns=['amount'], target_columns=['year'])
        row = save_override(editor, SOURCE_ID, NAMESPACE, **moved)

        assert row.created_by == author
        assert row.updated_by == editor


class TestRepeatedPair:
    def test_writing_the_same_pair_twice_updates_rather_than_raising(self):
        """The unique constraint on the pair must never surface as a 500: the
        admin's act is "this pair joins like *this*", and making them delete the
        old row first is ceremony around a decision already made."""
        save_override(NOBODY, SOURCE_ID, NAMESPACE, **a_join())

        moved = a_join(source_columns=['amount'], target_columns=['year'])
        save_override(NOBODY, SOURCE_ID, NAMESPACE, **moved)

        assert ErdRelationshipOverride.objects.count() == 1
        assert ErdRelationshipOverride.objects.get().columns_b == ['amount']

    def test_the_reversed_pair_is_the_same_row(self):
        """(A, B) and (B, A) are one assertion. Storing both would draw the pair
        twice and leave two rows to disagree - so the second write lands on the
        first row and simply flips which end is the referencing side."""
        save_override(NOBODY, SOURCE_ID, NAMESPACE, **a_join())
        assert ErdRelationshipOverride.objects.get().many_side == 'b'

        save_override(
            NOBODY,
            SOURCE_ID,
            NAMESPACE,
            **a_join(
                source_entity='datavault.gold_DimDate',
                target_entity='datavault.gold_Golden1_AllTransactions',
            ),
        )

        assert ErdRelationshipOverride.objects.count() == 1
        assert ErdRelationshipOverride.objects.get().many_side == 'a'


def reverse_stored_pair(monkeypatch):
    """Hand the write path a pair the model's CHECK will reject.

    Nothing on this tier can produce one honestly: the check re-derives
    `canonical_pair`'s ordering in SQL, and SQLite compares BINARY, which *is*
    the code-point order Python's `<` compares. The disagreement being stood in
    for is a real one - glibc's en_US.utf8 reads 'x_Bank' > 'x_account' - which
    is why the columns are pinned to the `C` collation.
    """
    ordered = services_module.canonical_pair

    def misordered(*ends):
        pair = ordered(*ends)
        return pair._replace(entity_a=pair.entity_b, entity_b=pair.entity_a)

    monkeypatch.setattr(services_module, 'canonical_pair', misordered)


class TestPairOrderDisagreement:
    """A database that orders the pair differently than OmniView does must refuse
    the write in its own voice. Uncaught, the constraint is a 500 on an admin's
    save with nothing in the response saying what is wrong or that no future save
    of that pair will work either."""

    def test_a_pair_the_database_will_not_order_is_refused_not_a_500(self, monkeypatch):
        reverse_stored_pair(monkeypatch)

        with pytest.raises(HttpError) as raised:
            save_override(NOBODY, SOURCE_ID, NAMESPACE, **a_join())

        assert raised.value.status_code == 422
        assert 'gold_DimDate' in raised.value.message

    def test_an_edit_onto_such_a_pair_is_refused_too(self, monkeypatch):
        """The edit path saves the row itself rather than going through
        `update_or_create`, so it needs the translation of its own."""
        row = save_override(NOBODY, SOURCE_ID, NAMESPACE, **a_join())
        reverse_stored_pair(monkeypatch)

        with pytest.raises(HttpError) as raised:
            update_override(
                NOBODY,
                row.pk,
                SOURCE_ID,
                NAMESPACE,
                **a_join(source_columns=['amount'], target_columns=['year']),
            )

        assert raised.value.status_code == 422

    def test_a_genuine_pair_collision_is_still_a_409(self):
        """The two must stay distinguishable. A collision means another row
        already owns the pair - answerable by editing that row - while an
        unorderable pair means this deployment cannot store the assertion at all.
        Reporting either as the other sends the admin after the wrong thing."""
        first = save_override(NOBODY, SOURCE_ID, NAMESPACE, **a_join())
        taken = a_join(target_entity='datavault.gold_Ledger')
        save_override(NOBODY, SOURCE_ID, NAMESPACE, **taken)

        with pytest.raises(HttpError) as raised:
            update_override(NOBODY, first.pk, SOURCE_ID, NAMESPACE, **taken)

        assert raised.value.status_code == 409


def test_an_override_written_against_a_renamed_column_still_applies(catalog):
    """A rebuild that re-cases a column must not silently drop the admin's edge -
    both ends are re-resolved case-insensitively on every read."""
    save_override(NOBODY, SOURCE_ID, NAMESPACE, **a_join(source_columns=['DATESK']))
    catalog['entities'] = [
        entity('gold_Golden1_AllTransactions', [column('DateSK')]),
        entity('gold_DimDate', [column('datesk')]),
    ]

    [edge] = build_graph(SOURCE_ID, NAMESPACE).relationships

    assert edge.origin == 'admin_override'
    assert edge.source.columns == ('DateSK',)
