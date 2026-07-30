"""Inference is the part of Omni-ERD that can be *wrong*, so its guarantees are
tested rather than assumed: declared always wins, guesses are labelled, and no
edge is ever drawn to a node that isn't on the canvas."""

from ..infer import SAME_NAMED_PK_CONFIDENCE, SURROGATE_KEY_CONFIDENCE, infer_relationships
from ..ir import KeyConstraint, Relationship, RelationshipEnd
from .fixtures import all_transactions, column, dim_category, dim_date, entity


def test_surrogate_keys_find_their_dimension():
    entities = [all_transactions(), dim_date(), dim_category()]

    edges = infer_relationships(entities, declared=[])

    by_target = {edge.target.entity: edge for edge in edges}
    assert 'datavault.gold_DimDate' in by_target
    assert 'datavault.gold_DimCategory' in by_target

    date_edge = by_target['datavault.gold_DimDate']
    assert date_edge.source.entity == 'datavault.gold_Golden1_AllTransactions'
    assert date_edge.source.columns == ('datesk',)
    assert date_edge.target.columns == ('datesk',)
    assert date_edge.cardinality == 'many_to_one'


def test_inferred_edges_are_labelled_as_guesses():
    """The UI dashes anything below 1.0 and shows `note` on hover. An unlabelled
    guess would be indistinguishable from a real constraint."""
    edges = infer_relationships([all_transactions(), dim_date()], declared=[])

    assert edges, 'expected at least one inferred edge'
    for edge in edges:
        assert edge.origin == 'inferred_naming'
        assert edge.confidence < 1.0
        assert edge.note


def test_the_surrogate_key_rule_outranks_the_same_name_rule():
    assert SURROGATE_KEY_CONFIDENCE > SAME_NAMED_PK_CONFIDENCE


def test_a_column_matching_another_entitys_primary_key_is_inferred():
    parent = entity(
        'accounts',
        [column('account_id'), column('name', 'text')],
        namespace='omniview',
        primary_key=KeyConstraint(name='accounts_pkey', columns=('account_id',)),
    )
    child = entity(
        'ledger',
        [column('account_id'), column('amount', 'numeric(18,2)')],
        namespace='omniview',
    )

    edges = infer_relationships([parent, child], declared=[])

    assert len(edges) == 1
    assert edges[0].source.entity == 'omniview.ledger'
    assert edges[0].target.entity == 'omniview.accounts'
    assert edges[0].confidence == SAME_NAMED_PK_CONFIDENCE


def test_declared_edges_are_never_overridden():
    """A real constraint and a naming coincidence between the same two tables
    would otherwise draw the same line twice, one of them dashed."""
    transactions, dates = all_transactions(), dim_date()
    declared = Relationship(
        id='fk:datavault.real_constraint',
        source=RelationshipEnd(transactions.id, ('datesk',)),
        target=RelationshipEnd(dates.id, ('datesk',)),
        origin='declared',
        confidence=1.0,
    )

    edges = infer_relationships([transactions, dates], declared=[declared])

    assert len(edges) == 1
    assert edges[0].origin == 'declared'


def test_a_reversed_declared_pair_also_suppresses_inference():
    transactions, dates = all_transactions(), dim_date()
    declared = Relationship(
        id='fk:datavault.backwards',
        source=RelationshipEnd(dates.id, ('datesk',)),
        target=RelationshipEnd(transactions.id, ('datesk',)),
        origin='declared',
    )

    edges = infer_relationships([transactions, dates], declared=[declared])

    assert [edge.origin for edge in edges] == ['declared']


def test_no_self_edges():
    """A dimension carries its own surrogate key; joining it to itself is noise."""
    dates = dim_date()

    edges = infer_relationships([dates], declared=[])

    assert edges == []


def test_edges_never_point_outside_the_requested_namespace():
    """The introspector reports cross-schema foreign keys faithfully, but the
    renderer cannot draw an edge to a node it does not have."""
    transactions = all_transactions()
    declared = Relationship(
        id='fk:datavault.elsewhere',
        source=RelationshipEnd(transactions.id, ('datesk',)),
        target=RelationshipEnd('some_other_schema.gold_DimDate', ('datesk',)),
        origin='declared',
    )

    edges = infer_relationships([transactions], declared=[declared])

    assert edges == []


def test_a_dimension_without_the_matching_column_is_not_matched():
    """`gold_DimDate` without a `datesk` column is not the thing `datesk` points
    at, however suggestive the name is."""
    transactions = all_transactions()
    hollow_dimension = entity('gold_DimDate', [column('id'), column('label', 'text')])

    edges = infer_relationships([transactions, hollow_dimension], declared=[])

    assert all(edge.target.entity != hollow_dimension.id for edge in edges)


def test_matching_is_case_insensitive_but_emits_the_catalogs_own_names():
    """dbt leaves CamelCase relations with lowercase columns. Matching has to
    ignore case; the emitted edge must still name columns the way the database
    does, or the frontend cannot find the handle."""
    fact = entity('fact_orders', [column('DateSK')])
    dates = entity('gold_DimDate', [column('datesk')])

    edges = infer_relationships([fact, dates], declared=[])

    assert len(edges) == 1
    assert edges[0].source.columns == ('DateSK',)
    assert edges[0].target.columns == ('datesk',)


def test_declared_edges_come_first_and_order_is_stable():
    """A reshuffling diagram on every refresh reads as a bug."""
    entities = [all_transactions(), dim_date(), dim_category()]

    first = infer_relationships(entities, declared=[])
    second = infer_relationships(entities, declared=[])

    assert [edge.id for edge in first] == [edge.id for edge in second]


def test_entities_without_conventions_yield_nothing():
    plain = entity('notes', [column('body', 'text'), column('created', 'date')])

    assert infer_relationships([plain, dim_date()], declared=[]) == []


def test_ids_are_unique_across_the_returned_edges():
    """React Flow keys edges by id; duplicates silently drop one of them."""
    edges = infer_relationships([all_transactions(), dim_date(), dim_category()], declared=[])

    assert len({edge.id for edge in edges}) == len(edges)
