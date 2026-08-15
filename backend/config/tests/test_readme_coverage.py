"""QOL6 tripwire: every source folder carries a standardized README.md.

The per-folder READMEs are an educational map of the repo (see docs/ARCHITECTURE.md
"Per-folder READMEs"). This test keeps them from silently rotting as folders are
added: a new source directory with no README, or a README missing one of the
standard headings, fails here.

It walks the source roots, prunes the excluded set (VCS/deps/build output,
generated dbt artifacts, migrations, fixture data - the genuinely contentless
directories), and asserts every remaining directory that holds real content has
a README.md containing all of REQUIRED_HEADINGS.
"""

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]

# The headings every standardized README must carry, verbatim.
REQUIRED_HEADINGS = (
    '## Purpose',
    '## Role in OmniView',
    '## Contents',
    '## Conventions & gotchas',
    '## See also',
)

# Directories to check, relative to the repo root. Roots themselves are checked
# too. The repo-root README.md is the project intro and is intentionally NOT
# required to follow the per-folder format.
SOURCE_ROOTS = (
    'backend',
    'frontend/src',
    'frontend/e2e',
    'frontend/public',
    'pipelines',
    'deploy',
    'docker',
    'docs',
)

# Directory *names* pruned wherever they appear.
EXCLUDED_NAMES = {
    '__pycache__',
    '.git',
    '.venv',
    'node_modules',
    '.next',
    'out',
    'dist',
    'staticfiles',
    'test-results',
    'playwright-report',
    'coverage',
    '.turbo',
    '.pytest_cache',
    '.mypy_cache',
    'migrations',
    '.e2e',
    # dbt generated output + its empty starter scaffolding (only a .gitkeep):
    'target',
    'logs',
    'dbt_packages',
    'analyses',
    'seeds',
    'snapshots',
    'macros',
    # Fixture *data* (CSV/YAML the tests load) is documented once in the tests/
    # README, not per-leaf.
    'data',
    # Same argument for the two docs/ payload directories: `examples` is sample
    # data (documented once in docs/examples/README.md, which is free-form like
    # the repo-root README rather than a per-folder one) and `assets` holds
    # binaries the docs embed. Neither is source code with conventions to state.
    'examples',
    'assets',
}


def _is_contentless(directory: Path, children: list[Path]) -> bool:
    """A directory needs no README if, after pruning, it holds nothing but a
    .gitkeep (an empty placeholder) and no documentable subdirectories."""
    files = [c for c in children if c.is_file() and c.name != 'README.md']
    subdirs = [c for c in children if c.is_dir() and c.name not in EXCLUDED_NAMES]
    if not subdirs and all(f.name == '.gitkeep' for f in files):
        return True
    return False


def _required_dirs() -> list[Path]:
    required: list[Path] = []
    for root_name in SOURCE_ROOTS:
        root = REPO_ROOT / root_name
        # Fail loudly rather than skipping: a root that was moved or renamed
        # without updating SOURCE_ROOTS would otherwise drop a whole tree out of
        # coverage with no test failure at all.
        if not root.exists():
            raise AssertionError(
                f'SOURCE_ROOTS names {root_name!r}, which does not exist. '
                'Update SOURCE_ROOTS to match the current layout.'
            )
        for directory in [root, *(p for p in root.rglob('*') if p.is_dir())]:
            if any(part in EXCLUDED_NAMES for part in directory.relative_to(REPO_ROOT).parts):
                continue
            children = list(directory.iterdir())
            if _is_contentless(directory, children):
                continue
            required.append(directory)
    return required


REQUIRED_DIRS = _required_dirs()


def test_source_roots_resolved():
    # Guard against a bad REPO_ROOT silently making the sweep check nothing.
    assert (REPO_ROOT / 'backend').is_dir()
    assert len(REQUIRED_DIRS) > 30


@pytest.mark.parametrize('directory', REQUIRED_DIRS, ids=lambda d: str(d.relative_to(REPO_ROOT)))
def test_directory_has_standard_readme(directory: Path):
    rel = directory.relative_to(REPO_ROOT)
    readme = directory / 'README.md'
    assert readme.is_file(), f'{rel} has no README.md (QOL6: every source folder needs one)'
    text = readme.read_text(encoding='utf-8')
    missing = [h for h in REQUIRED_HEADINGS if h not in text]
    assert not missing, f'{rel}/README.md is missing headings: {missing}'
