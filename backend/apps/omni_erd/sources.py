"""What Omni-ERD is allowed to introspect.

An allowlist, not a discovery mechanism. The app never scans for schemas and
never accepts a connection string from the client: a request names a source id
that must appear here, or it 404s. Two consequences worth keeping:

- No SQL injection surface. Namespaces are validated against this list before
  they reach a query.
- No accidental reach. `pg_catalog`, `information_schema` and any future schema
  stay invisible until someone adds them deliberately.

The Databricks entry is present but unconfigured in the POC (see
introspect/databricks.py); it resolves, reports `available=False`, and returns a
503 with a reason rather than pretending the source does not exist.
"""

from __future__ import annotations

from dataclasses import dataclass

from .introspect.base import SchemaIntrospector
from .introspect.databricks import DatabricksIntrospector
from .introspect.postgres import PostgresIntrospector


@dataclass(frozen=True)
class Source:
    id: str
    label: str
    dialect: str
    description: str
    namespaces: tuple[str, ...]
    #: Built per request rather than held: a Django connection alias is only
    #: meaningful inside a request/thread.
    factory: object

    def introspector(self) -> SchemaIntrospector:
        return self.factory()  # type: ignore[operator]


SOURCES: tuple[Source, ...] = (
    Source(
        id='pg-omniview',
        label='OmniView (app schema)',
        dialect='postgres',
        description=(
            "Django's own tables plus the managed source data - the only schema "
            'here with real foreign keys.'
        ),
        namespaces=('omniview',),
        factory=lambda: PostgresIntrospector(alias='default', schemas=('omniview',)),
    ),
    Source(
        id='pg-datavault',
        label='Data Vault (dbt warehouse)',
        dialect='postgres',
        description=(
            'The bronze/silver/gold relations dbt builds. Declares no foreign '
            'keys at all - every edge here is inferred.'
        ),
        namespaces=('datavault',),
        factory=lambda: PostgresIntrospector(alias='datavault', schemas=('datavault',)),
    ),
    Source(
        id='databricks-uc',
        label='Unity Catalog',
        dialect='databricks',
        description='A Databricks SQL catalog. Requires OMNI_ERD_DATABRICKS_CATALOG.',
        namespaces=(),
        factory=DatabricksIntrospector,
    ),
)

SOURCES_BY_ID = {source.id: source for source in SOURCES}


def get_source(source_id: str) -> Source | None:
    return SOURCES_BY_ID.get(source_id)
