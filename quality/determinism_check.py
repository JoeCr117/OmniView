"""Is the ExpenseTracker pipeline deterministic?

Runs it twice against the same source rows and compares a content hash of every
relation it builds. Equal hashes mean the same input produced the same warehouse;
unequal means something non-deterministic leaked into a model - an unstable sort,
a `now()`, a hash-ordered aggregate, a row_number over an unordered window.

This is the strongest correctness signal available for an ETL project and it needs
no fixtures: the pipeline is its own oracle.

    docker compose -f docker/docker-compose.yml up -d db
    cd backend; $env:DJANGO_SETTINGS_MODULE='config.settings.e2e'
    uv run python manage.py e2e_bootstrap          # seeds the scratch database
    cd ..
    uv run python quality/determinism_check.py

Runs against `omniview_e2e` and refuses anything else: a rebuild DROPS the whole
datavault schema, and pointing that at the real database would destroy live data.
Never reads Data/ - the scratch database is seeded from test fixtures.
"""

import os
import subprocess
import sys
from pathlib import Path

# Run as a plain script, so sys.path[0] is quality/ rather than the repo root -
# and `pipelines` only resolves from the root. The pipeline itself sidesteps this
# by being run with `-m`; this file cannot, because quality/ is not a package.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

SCRATCH_DATABASE = 'omniview_e2e'
PIPELINE = ['python', '-m', 'pipelines.expense_tracker.main']

#: Hash each relation by its own row text, ordered by that text. Ordering by
#: content rather than by a column means the comparison does not care how the
#: rows happen to land on disk - only whether the same set of rows came out.
_RELATION_HASH = """
SELECT md5(coalesce(string_agg(row_text, '|' ORDER BY row_text), ''))
  FROM (SELECT t::text AS row_text FROM {ident} t) s
"""

_RELATIONS = """
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'datavault' AND table_type = 'BASE TABLE'
 ORDER BY table_name
"""


def _engine():
    from pipelines.common.postgres import pg_engine

    return pg_engine()


def snapshot() -> dict[str, str]:
    """{relation: content hash} for everything in datavault."""
    from sqlalchemy import text

    engine = _engine()
    try:
        with engine.connect() as conn:
            names = [row[0] for row in conn.execute(text(_RELATIONS))]
            return {
                name: conn.execute(
                    text(_RELATION_HASH.format(ident=f'datavault."{name}"'))
                ).scalar_one()
                for name in names
            }
    finally:
        engine.dispose()


def run_pipeline() -> None:
    subprocess.run([sys.executable, *PIPELINE[1:]], check=True)


def main() -> int:
    if os.environ.get('PGDATABASE') != SCRATCH_DATABASE:
        print(
            f'Refusing to run: PGDATABASE is {os.environ.get("PGDATABASE")!r}, not '
            f'{SCRATCH_DATABASE!r}. A rebuild drops the datavault schema.',
            file=sys.stderr,
        )
        return 2

    run_pipeline()
    first = snapshot()
    run_pipeline()
    second = snapshot()

    if not first:
        print('No relations were built - nothing to compare.', file=sys.stderr)
        return 2

    appeared = sorted(set(second) - set(first))
    vanished = sorted(set(first) - set(second))
    differing = sorted(name for name in first.keys() & second.keys() if first[name] != second[name])

    print(f'\nrelations compared: {len(first.keys() & second.keys())}')
    for label, names in (
        ('differ between runs', differing),
        ('only in run 2', appeared),
        ('only in run 1', vanished),
    ):
        print(f'{label}: {len(names)}')
        for name in names:
            print(f'    {name}')

    return 1 if (differing or appeared or vanished) else 0


if __name__ == '__main__':
    raise SystemExit(main())
