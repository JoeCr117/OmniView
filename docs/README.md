# docs/

## Purpose
The project's long-form reference documentation: the structure contract, the
deployment runbook, and the milestone history. These are the documents you read
to understand *why* the codebase looks the way it does.

## Role in OmniView
These files are the authoritative references the rest of the repo points
at. Per-folder `README.md` files describe their own directory and link here for
the wider picture; `CLAUDE.md` at the repo root carries the day-to-day operating
rules and defers to `ARCHITECTURE.md` for the full contract.

## Contents
| Item | What it does |
|------|--------------|
| `ARCHITECTURE.md` | The structure contract: what lives where, why Django app labels are pinned, how the app registry works, and the checklist for adding a new OmniView app. Read before moving code between packages. |
| `DEPLOYMENT.md` | The runbook: running the app, every environment variable, authentication setup, the Databricks/Lakebase deployment and its failure modes, and the test tiers. |
| `HANDOFF.md` | The working state: what exists, current invariants, known issues, and outstanding tasks. Read this first when picking the project up cold. |
| `ARTIFACTS.md` | The Manifest of Artifacts: every resource the project creates (containers, images, volumes, databases, schemas, tables, views, roles, users, build output), plus what is protected from deletion and what is recoverable. Generated, not hand-edited — see the `generate-artifact-manifest` skill; consumed by the `teardown` skill. |

## Conventions & gotchas
- **`HANDOFF.md` describes the present, not the past.** It was condensed from a
  ~1,300-line append-only milestone log on 2026-07-19; that log lives on in git
  (`git log --follow -- docs/HANDOFF.md`). Keep it current and bounded — when a
  known issue is fixed or a task is done, edit or delete the entry rather than
  appending a new dated section under it.
- **Two docs deliberately stay at the repo root**: `README.md` (declared by
  `pyproject.toml`'s `readme =` field) and `CLAUDE.md` (auto-loaded from the root
  by Claude Code). Neither can move without breaking a tool.
- Docker usage is documented in [docker/README.md](../docker/README.md), not in
  `DEPLOYMENT.md` — it is the local dev/test environment, separate from deployment.
- Links from other folders into these files are repo-relative (`docs/NAME.md`) or
  correctly-depthed relative links. A move here means fixing both.

## See also
- [Repo root](../README.md) · [docker/](../docker/README.md) · [deploy/](../deploy/README.md)
- [backend/](../backend/README.md) · [frontend/](../frontend/src/README.md) · [pipelines/](../pipelines/README.md)
