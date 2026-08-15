"""
Assembles the Databricks Apps source bundle at dist/databricks_app/.

    uv run python deploy/databricks/build_app.py [--skip-frontend]

Contents: backend/ (with a fresh staticfiles/), pipelines/, this directory's
databricks_start.py and app.yaml (both flattened to the bundle ROOT, where
Databricks Apps expects them), root pyproject.toml + uv.lock, and a fresh
frontend/out static export. uv mode is mandatory (Python >= 3.13), so the
script fails if any requirements.txt would land in the bundle. Deploy with:

    databricks workspace import-dir dist/databricks_app /Workspace/Users/<you>/omniview-app --overwrite --profile <profile>
    databricks apps deploy omniview --source-code-path /Workspace/Users/<you>/omniview-app --profile <profile>

Use `workspace import-dir --overwrite`, NOT `databricks sync`: sync honors
.gitignore, dist/ is gitignored, so sync uploads nothing and the deploy then
fails with "no files found".
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# parents[2]: this file is deploy/databricks/build_app.py, so the repo root is
# two levels up. Keep in step if this script ever moves depth.
REPO = Path(__file__).resolve().parents[2]
DIST = REPO / 'dist' / 'databricks_app'

# (source-relative-to-REPO, dest-relative-to-DIST). Directories are copied with
# IGNORES pruned. Note databricks_start.py and app.yaml both FLATTEN from
# deploy/databricks/ to the bundle root: Databricks Apps runs app.yaml's
# `command: ["python", "databricks_start.py"]` from there, and
# databricks_start.py resolves ./backend relative to itself. That adjacency
# exists only in the bundle, never in the repo.
COPIES = [
    ('backend', 'backend'),
    ('pipelines', 'pipelines'),
    ('deploy/databricks/databricks_start.py', 'databricks_start.py'),
    ('deploy/databricks/app.yaml', 'app.yaml'),
    ('pyproject.toml', 'pyproject.toml'),
    ('uv.lock', 'uv.lock'),
    ('frontend/out', 'frontend/out'),
]

_COMMON = ('__pycache__', '*.pyc', '.pytest_cache')
# Per-source ignore sets. ignore_patterns matches basenames at every level, so
# 'tests' prunes each app's tests/ package (and its fixture data) out of the
# backend, wherever it sits. The pipelines tree deliberately does NOT prune
# 'tests': dbt/tests/ holds real dbt data tests that run during `dbt build`.
#
# These keys MUST stay byte-identical to the COPIES source strings above: the
# lookup is IGNORES.get(source, DEFAULT_IGNORE), so a renamed source silently
# falls back to the default and ships tests/ + conftest.py to production
# instead of raising. Verify after any change with:
#   ls dist/databricks_app/backend/**/tests   # must find nothing
IGNORES = {
    'backend': shutil.ignore_patterns(*_COMMON, '.e2e', 'tests', 'conftest.py'),
    'pipelines': shutil.ignore_patterns(*_COMMON, 'target', 'logs', 'dbt_packages'),
}
DEFAULT_IGNORE = shutil.ignore_patterns(*_COMMON)

# Names that must never appear under backend/ in the bundle. Enforced after the
# copy (see _assert_no_test_code) rather than trusted to the ignore sets, since
# the failure mode is silent: an IGNORES key that no longer matches a COPIES
# source just falls back to DEFAULT_IGNORE and ships test code to production.
FORBIDDEN_IN_BACKEND = ('tests', 'conftest.py', '.e2e')


def _assert_ignore_keys_match_copies() -> None:
    """IGNORES is keyed by COPIES source strings; a stale key prunes nothing."""
    sources = {source for source, _ in COPIES}
    unknown = sorted(set(IGNORES) - sources)
    if unknown:
        sys.exit(
            f'IGNORES keys not present in COPIES: {unknown}. They prune nothing, so the '
            'affected trees would ship unpruned. Update the keys to match COPIES.'
        )


def _assert_no_test_code() -> None:
    """Last line of defence: fail the build rather than ship test code."""
    backend = DIST / 'backend'
    leaked = sorted(
        p.relative_to(DIST).as_posix() for p in backend.rglob('*') if p.name in FORBIDDEN_IN_BACKEND
    )
    if leaked:
        sys.exit(
            f'test code leaked into the bundle ({len(leaked)} path(s)): {leaked[:10]}\n'
            'The backend IGNORES entry is not pruning - check that its key still '
            'matches its COPIES source string.'
        )


def run(cmd: list[str], cwd: Path) -> None:
    print(f'>> {" ".join(cmd)}')
    subprocess.run(cmd, cwd=cwd, check=True, shell=(cmd[0] == 'npm'))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        '--skip-frontend',
        action='store_true',
        help='reuse the existing frontend/out instead of running next build',
    )
    args = parser.parse_args()

    _assert_ignore_keys_match_copies()

    # app.yaml is git-ignored (admin allow-list + this deployment's app URL), so a
    # fresh clone has only the template. Fail here rather than 100 lines later.
    app_yaml = REPO / 'deploy' / 'databricks' / 'app.yaml'
    if not app_yaml.is_file():
        sys.exit(
            f'{app_yaml} is missing. It is git-ignored (it carries the admin '
            'allow-list and deployment-specific URLs), so a fresh clone starts '
            'from the template:\n'
            '  cp deploy/databricks/app.example.yaml deploy/databricks/app.yaml\n'
            'then fill in the <PLACEHOLDER> values.'
        )

    if not args.skip_frontend:
        run(['npm', 'run', 'build'], cwd=REPO / 'frontend')
    if not (REPO / 'frontend' / 'out' / 'index.html').exists():
        sys.exit('frontend/out is missing or incomplete - run without --skip-frontend')

    run([sys.executable, 'manage.py', 'collectstatic', '--noinput'], cwd=REPO / 'backend')

    shutil.rmtree(DIST, ignore_errors=True)
    DIST.mkdir(parents=True)

    for source, dest in COPIES:
        src = REPO / source
        target = DIST / dest
        if src.is_dir():
            shutil.copytree(src, target, ignore=IGNORES.get(source, DEFAULT_IGNORE))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, target)

    offenders = list(DIST.rglob('requirements.txt'))
    if offenders:
        sys.exit(f'requirements.txt found in bundle (forces pip/Python 3.11 mode): {offenders}')

    _assert_no_test_code()

    # The two specs must land at the bundle ROOT: Databricks Apps runs app.yaml
    # from there, and databricks_start.py resolves ./backend relative to itself.
    for required in ('app.yaml', 'databricks_start.py'):
        if not (DIST / required).is_file():
            sys.exit(f'{required} is missing from the bundle root - check the COPIES dest paths')

    total = sum(f.stat().st_size for f in DIST.rglob('*') if f.is_file())
    files = sum(1 for f in DIST.rglob('*') if f.is_file())
    biggest = max((f for f in DIST.rglob('*') if f.is_file()), key=lambda f: f.stat().st_size)
    print(f'Bundle ready: {DIST}')
    print(
        f'  {files} files, {total / 1e6:.1f} MB total; '
        f'largest {biggest.relative_to(DIST)} ({biggest.stat().st_size / 1e6:.1f} MB, limit 10 MB/file)'
    )


if __name__ == '__main__':
    main()
