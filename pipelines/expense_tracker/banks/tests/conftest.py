"""Constants and helpers shared by every module in this test package.

Only genuinely duplicated items live here. A helper used by one module stays
in that module, where its reason for existing is next to its only caller.

`V2_HEADER` is spelled out literally rather than imported from
`golden1_schema.GOLDEN1_CSV_SCHEMAS`: the schema-detection tests assert that
this exact header selects v2, and sourcing it from the table under test would
make that assertion agree with the production code by construction.
"""

from pathlib import Path

#: `docs/examples/Banks/Golden1/` - the synthetic public stand-in for `Data/`
#: (real, git-ignored bank exports). No test may read `Data/`.
FIXTURES_DIR = Path(__file__).resolve().parents[4] / 'docs' / 'examples' / 'Banks' / 'Golden1'

#: Golden1's 2026 export header, as `sniff_header` returns it.
V2_HEADER: tuple[str, ...] = (
    'Date',
    'Account',
    'Account Type',
    'Description',
    'Check #',
    'Category',
    'Credit',
    'Debit',
    'Daily Balance',
)

#: The same header as the first line of a CSV, for tests that build a v2 file
#: inline. Derived so the tuple stays the one place the header is written down.
V2_HEADER_LINE = ','.join(V2_HEADER) + '\n'


def _fixture_text(account: str, filename: str) -> str:
    """One fixture CSV's text. `utf-8-sig` because an export may carry a BOM."""
    return (FIXTURES_DIR / account / filename).read_text(encoding='utf-8-sig')
