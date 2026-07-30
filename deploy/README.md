# deploy/

## Purpose
Everything needed to ship OmniView to a real environment: the deployment
descriptors, the bundle builder, and the teardown tool. One subdirectory per
deployment target.

## Role in OmniView
This is the production path. `deploy/databricks/` builds the source bundle that
Databricks Apps runs, and owns the manifest recording every workspace resource
the deployment created. Nothing here is used for local development — for that,
see [docker/](../docker/README.md), which provides the local dev/test
environment and never touches this directory.

## Contents
| Item | What it does |
|------|--------------|
| `databricks/` | The only deployment target: app spec, resource bindings, manifest, bundle builder, teardown. |

## Conventions & gotchas
- **Local ≠ deployed.** Docker is the local environment; Databricks Apps is
  production and uses no Docker at all. The two share only the `PG*` env-var
  contract.
- A new deployment target gets its own subdirectory here rather than loose
  files, so the per-target build/teardown scripts stay beside the specs they read.

## See also
- [Repo root](../README.md) · [deploy/databricks/](databricks/README.md) · [docker/](../docker/README.md)
- `docs/DEPLOYMENT.md` — the runbook (provisioning, per-deploy commands, failure modes).
