"""
Tears down every Databricks resource the OmniView deployment created -
exactly the ones listed in deploy/databricks/databricks_manifest.json,
nothing else.

    uv run python deploy/databricks/tear_down.py           # dry run (prints the plan)
    uv run python deploy/databricks/tear_down.py --yes     # actually delete

Each step verifies the resource still exists before deleting and reports
already-gone resources as SKIP, so partial teardowns can be re-run safely.
The Lakebase project deletion takes all app data offline (auth, uploaded CSVs,
budget map, warehouse) - the local Data/Banks tree remains the re-import
source. Resources not present in the manifest are never touched.

Note the Lakebase step is a SOFT delete (verified 2026-07-19): the project is
recoverable in full - data, uid and endpoint host - via

    databricks postgres undelete-project projects/omniview

until its purge_time (delete + 7 days), and the slug stays reserved for that
whole window. So after running this you CANNOT recreate the project under the
same name until the purge date; until then undelete is the only way back. See
databricks_manifest.json 'lakebase_soft_delete'.

Redeploying afterwards is fully automated and needs no manual psql: the
build-omniview skill undeletes (or recreates) the project and then runs
deploy/databricks/provision_db.py, which idempotently re-grants the freshly-minted
app service principal into the omniview_owner role. This script only destroys; it
leaves nothing behind that a redeploy has to clean up by hand.

A probe that fails for any reason OTHER than "the resource is gone" aborts the
run instead of being reported as SKIP. Without that distinction an expired CLI
token makes every resource look already-deleted, and the script exits 0 having
never reached the workspace - i.e. it reports a successful teardown that did
nothing. A preflight auth check catches the common case up front.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

# Sibling file - both live in deploy/databricks/.
MANIFEST = Path(__file__).resolve().parent / 'databricks_manifest.json'
EXAMPLE_MANIFEST = MANIFEST.with_name('databricks_manifest.example.json')


def read_manifest() -> dict:
    """The manifest, or a pointed error - it is git-ignored deployment state, so a
    fresh clone has none and there is by definition nothing to tear down yet."""
    if not MANIFEST.exists():
        raise TeardownError(
            f'no manifest at {MANIFEST}.\n'
            'It is git-ignored (deployment state, not source), so a fresh clone '
            'has none - and with no manifest there is nothing to tear down. '
            f'If you do have a deployment, copy {EXAMPLE_MANIFEST.name} to '
            f'{MANIFEST.name} and fill in your workspace values, or re-run the '
            'generate-artifact-manifest skill.'
        )
    return json.loads(MANIFEST.read_text(encoding='utf-8'))


# Substrings that mark a probe failure as a genuine "resource does not exist"
# rather than an auth/network/permission problem. Matched case-insensitively
# against the CLI's combined stdout+stderr.
NOT_FOUND_MARKERS = (
    'does not exist',
    "doesn't exist",
    'resource_does_not_exist',
    'not found',
    'no such',
    'cannot find',
)


class TeardownError(RuntimeError):
    """A CLI call failed for a reason other than the resource being gone."""


def cli(profile: str, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    cmd = ['databricks', *args, '--profile', profile]
    try:
        return subprocess.run(cmd, capture_output=True, text=True, check=check)
    except FileNotFoundError as exc:
        raise TeardownError('the `databricks` CLI is not installed or not on PATH') from exc


def _looks_like_not_found(result: subprocess.CompletedProcess) -> bool:
    blob = f'{result.stdout}\n{result.stderr}'.lower()
    return any(marker in blob for marker in NOT_FOUND_MARKERS)


def preflight(profile: str) -> None:
    """Fail fast on an expired/misconfigured profile, so a broken token can
    never be mistaken for an already-torn-down workspace."""
    result = cli(profile, 'current-user', 'me', check=False)
    if result.returncode != 0:
        raise TeardownError(
            f'the Databricks CLI is not authenticated for profile {profile!r}, so '
            'resource probes cannot be trusted.\n'
            f'          Re-authenticate with: databricks auth login --profile {profile}\n'
            f'          CLI said: {(result.stderr or result.stdout).strip()}'
        )


def exists(profile: str, resource: dict) -> bool:
    probes = {
        'app': ['apps', 'get', resource['id']],
        'workspace_directory': ['workspace', 'get-status', resource['id']],
        'secret_scope': None,  # handled below (no get; list and search)
        'lakebase_project': ['postgres', 'get-project', resource['id']],
    }
    if resource['type'] == 'secret_scope':
        result = cli(profile, 'secrets', 'list-scopes', '-o', 'json', check=False)
        if result.returncode != 0:
            # Listing scopes is not resource-specific: any failure here is an
            # auth/permission problem, never evidence that the scope is gone.
            raise TeardownError(
                f'could not list secret scopes: {(result.stderr or result.stdout).strip()}'
            )
        scopes = json.loads(result.stdout or '[]')
        return any(s.get('name') == resource['id'] for s in scopes)
    result = cli(profile, *probes[resource['type']], check=False)
    if result.returncode == 0:
        return True
    if _looks_like_not_found(result):
        return False
    raise TeardownError(
        f'probing {resource["type"]} {resource["id"]!r} failed for a reason other than '
        f'it being absent: {(result.stderr or result.stdout).strip()}'
    )


def delete(profile: str, resource: dict) -> None:
    commands = {
        'app': ['apps', 'delete', resource['id']],
        'workspace_directory': ['workspace', 'delete', resource['id'], '--recursive'],
        'secret_scope': ['secrets', 'delete-scope', resource['id']],
        'lakebase_project': ['postgres', 'delete-project', resource['id']],
    }
    cli(profile, *commands[resource['type']])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--yes', action='store_true', help='perform the deletions (default: dry run)'
    )
    args = parser.parse_args()

    manifest = read_manifest()
    profile = manifest['cli_profile']
    resources = manifest['resources']

    print(f'Workspace: {manifest["workspace_host"]} (profile {profile})')
    preflight(profile)
    print(f'{"Deleting" if args.yes else "DRY RUN - would delete"} {len(resources)} resource(s):\n')

    failures = 0
    skipped = 0
    for resource in resources:
        label = f'{resource["type"]:<20} {resource["id"]}'
        if not exists(profile, resource):
            skipped += 1
            print(f'  SKIP    {label} (not found - already deleted?)')
            continue
        if not args.yes:
            print(f'  PLAN    {label}')
            continue
        try:
            delete(profile, resource)
            print(f'  DELETED {label}')
        except subprocess.CalledProcessError as exc:
            failures += 1
            print(f'  FAILED  {label}\n          {exc.stderr.strip()}')

    if skipped == len(resources):
        # Every probe said "absent". That is legitimate after a completed
        # teardown, but it is also what a half-broken environment looks like,
        # so say so rather than let an all-SKIP run read as success.
        print(
            '\nNote: every resource probed as already absent. If that is unexpected, '
            'confirm the profile targets the right workspace before assuming the '
            'teardown is done.'
        )
    if not args.yes:
        print('\nRe-run with --yes to delete. The lakebase_project step destroys all app data.')
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    try:
        main()
    except TeardownError as exc:
        # Never let an unreachable/unauthenticated workspace exit 0 - that would
        # read as "teardown complete" when nothing was even inspected.
        sys.exit(f'ABORTED: {exc}')
