"""The precedence an admin override is worth: it outranks the catalog itself.

`infer.py`'s four tiers are only meaningful if the top one really is the top one -
an override that a declared constraint could beat would leave an admin no way to
say "not that line". These tests pin the tier order, the labelling that keeps an
override rendering solid, and the silence with which one that no longer fits the
catalog is dropped.

Pure functions over `ir` dataclasses, so no database and no source is involved.
"""

from ..infer import infer_relationships, resolve_override
from ..ir import OverrideProblem, Relationship, RelationshipEnd
from .fixtures import all_transactions, column, dim_category, dim_date, entity, override


def by_id(*entities):
    return {one.id: one for one in entities}


def declared_between(source, target, columns=('datesk',)):
    return Relationship(
        id='fk:datavault.real_constraint',
        source=RelationshipEnd(source.id, columns),
        target=RelationshipEnd(target.id, columns),
        origin='declared',
        confidence=1.0,
    )


def test_an_override_outranks_a_declared_constraint():
    """The admin is correcting *this diagram*, so even a real foreign key gives
    way - otherwise a wrong constraint could never be redrawn."""
    transactions, dates = all_transactions(), dim_date()
    declared = declared_between(transactions, dates)
    asserted = override(transactions.id, ('amount',), dates.id, ('year',))

    edges = infer_relationships([transactions, dates], [declared], [asserted])

    assert len(edges) == 1
    assert edges[0].origin == 'admin_override'
    assert edges[0].source.columns == ('amount',)
    assert edges[0].target.columns == ('year',)


def test_an_override_outranks_the_inference_rules():
    transactions, dates = all_transactions(), dim_date()
    asserted = override(transactions.id, ('amount',), dates.id, ('year',))

    edges = infer_relationships([transactions, dates], [], [asserted])

    assert [edge.origin for edge in edges] == ['admin_override']
    assert edges[0].source.columns == ('amount',)


def test_a_suppressed_pair_loses_its_declared_edge_and_gains_no_override_edge():
    """`suppress` is the admin saying the line should not be drawn at all. It
    claims the pair so no lower tier can take it, and emits nothing itself."""
    transactions, dates = all_transactions(), dim_date()
    declared = declared_between(transactions, dates)
    silenced = override(transactions.id, (), dates.id, (), action='suppress')

    edges = infer_relationships([transactions, dates], [declared], [silenced])

    assert edges == []


def test_a_suppressed_pair_loses_its_inferred_edge():
    transactions, dates = all_transactions(), dim_date()
    silenced = override(transactions.id, (), dates.id, (), action='suppress')

    edges = infer_relationships([transactions, dates], [], [silenced])

    assert edges == []


def test_a_suppression_leaves_every_other_pair_alone():
    transactions, dates, categories = all_transactions(), dim_date(), dim_category()
    silenced = override(transactions.id, (), dates.id, (), action='suppress')

    edges = infer_relationships([transactions, dates, categories], [], [silenced])

    assert [edge.target.entity for edge in edges] == [categories.id]


def test_an_override_edge_is_an_assertion_rather_than_a_guess():
    """The UI dashes everything below 1.0. An override that rendered dashed would
    read as something the app guessed, which is the opposite of what it is."""
    transactions, dates = all_transactions(), dim_date()
    asserted = override(transactions.id, ('datesk',), dates.id, ('datesk',), note='by hand')

    [edge] = infer_relationships([transactions, dates], [], [asserted])

    assert edge.origin == 'admin_override'
    assert edge.confidence == 1.0
    assert edge.note == 'by hand'


def test_an_override_matches_columns_case_insensitively_and_emits_the_catalogs_spelling():
    """An override outlives the rebuild it was written against, and dbt-postgres
    leaves lowercase columns behind whatever an admin typed. Matching has to
    ignore case; the emitted edge must name the column the way the catalog spells
    it now, or the frontend cannot find the handle."""
    fact = entity('fact_orders', [column('datesk')])
    dates = entity('gold_DimDate', [column('datesk')])
    asserted = override(fact.id, ('DATESK',), dates.id, ('DateSk',))

    [edge] = infer_relationships([fact, dates], [], [asserted])

    assert edge.source.columns == ('datesk',)
    assert edge.target.columns == ('datesk',)


def test_an_override_naming_a_missing_entity_reports_which_one():
    dates = dim_date()
    asserted = override('datavault.gone', ('datesk',), dates.id, ('datesk',))

    problem = resolve_override(asserted, by_id(dates))

    assert problem == OverrideProblem('unknown_entity', 'datavault.gone is not in this diagram')


def test_an_override_naming_a_missing_column_reports_which_one():
    fact, dates = all_transactions(), dim_date()
    asserted = override(fact.id, ('nope',), dates.id, ('datesk',))

    problem = resolve_override(asserted, by_id(fact, dates))

    assert problem == OverrideProblem('unknown_column', f'{fact.id} has no column nope')


def test_an_override_joining_an_entity_to_itself_is_refused():
    dates = dim_date()
    asserted = override(dates.id, ('datesk',), dates.id, ('datesk',))

    problem = resolve_override(asserted, by_id(dates))

    assert problem == OverrideProblem('self_pair', f'{dates.id} cannot be joined to itself')


def test_an_override_that_no_longer_fits_the_catalog_is_dropped_silently():
    """The diagram is read by every granted user; a dangling override is not
    their problem. It must not raise, and it must not cost the pairs it says
    nothing about."""
    transactions, dates = all_transactions(), dim_date()
    dangling = override('datavault.gone', ('datesk',), dates.id, ('datesk',))

    edges = infer_relationships([transactions, dates], [], [dangling])

    assert [edge.origin for edge in edges] == ['inferred_naming']
    assert edges[0].source.entity == transactions.id


def test_an_override_naming_a_missing_column_neither_raises_nor_suppresses_its_pair():
    """The pair is only claimed by an override that actually resolved - a typo in
    a column name must not silently erase the edge inference would have drawn."""
    transactions, dates = all_transactions(), dim_date()
    dangling = override(transactions.id, ('nope',), dates.id, ('datesk',))

    edges = infer_relationships([transactions, dates], [], [dangling])

    assert [edge.origin for edge in edges] == ['inferred_naming']


def test_overrides_come_first_then_declared_then_inferred_and_the_order_is_stable():
    """A reshuffling diagram on every refresh reads as a bug, and the tier order
    is what the legend claims."""
    transactions, dates, categories = all_transactions(), dim_date(), dim_category()
    ledger = entity('gold_Ledger', [column('datesk'), column('memo', 'text')])
    asserted = override(transactions.id, ('amount',), dates.id, ('year',))
    declared = declared_between(transactions, categories, columns=('categorysk',))

    entities = [transactions, dates, categories, ledger]
    first = infer_relationships(entities, [declared], [asserted])
    second = infer_relationships(entities, [declared], [asserted])

    assert [edge.origin for edge in first] == ['admin_override', 'declared', 'inferred_naming']
    assert [edge.id for edge in first] == [edge.id for edge in second]


def test_ids_stay_unique_once_overrides_are_in_the_mix():
    """React Flow keys edges by id; a duplicate silently drops one of them."""
    transactions, dates, categories = all_transactions(), dim_date(), dim_category()
    ledger = entity('gold_Ledger', [column('datesk'), column('memo', 'text')])
    asserted = override(transactions.id, ('amount',), dates.id, ('year',), id='ovr:7')
    declared = declared_between(transactions, categories, columns=('categorysk',))

    edges = infer_relationships([transactions, dates, categories, ledger], [declared], [asserted])

    assert len({edge.id for edge in edges}) == len(edges)
