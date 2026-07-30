"""The contract every engine adapter implements.

An introspector's only job is to turn one engine's catalog into `ir` types. It
does no inference (that is `infer.py`), no caching and no HTTP - so an adapter
can be unit-tested by feeding it catalog rows, with no live database anywhere.

Adding an engine means adding a module here and a row in `sources.py`. Nothing
else in the app should have to learn the engine's name.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..ir import Entity, Relationship


class IntrospectionUnavailable(Exception):
    """The source exists but cannot be read right now.

    Raised for a missing catalog, an unconfigured warehouse or a refused
    connection - anything that is the *source's* problem rather than the
    caller's. `api.py` maps it to a 503 with a human-readable reason so the
    frontend can render an empty state instead of an error.
    """


@runtime_checkable
class SchemaIntrospector(Protocol):
    #: Engine identifier carried into SchemaGraph.source.dialect.
    dialect: str

    def namespaces(self) -> list[str]:
        """Schemas this source is allowed to expose, in display order."""
        ...

    def entities(self, namespace: str) -> list[Entity]:
        """Tables/views in `namespace`, with their columns and key constraints."""
        ...

    def declared_relationships(self, namespace: str) -> list[Relationship]:
        """Foreign keys the catalog actually declares. May legitimately be empty:
        dbt builds every `datavault` relation with CTAS, which carries no
        constraints at all."""
        ...
