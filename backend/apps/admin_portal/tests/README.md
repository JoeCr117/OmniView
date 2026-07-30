# backend/apps/admin_portal/tests/

## Purpose
Tests for the Admin Portal: access grant/revoke, admin promotion, the users API,
enforcement, and the Databricks-backed costs/jobs/overview endpoints.

## Role in OmniView
Locks the access-control matrix (only admins can grant; non-admins 403) and the
degrade-gracefully behaviour of the Databricks tabs (not-connected → 503,
missing-scope → 403, jobs → app-identity fallback).

## Contents
| Item | What it does |
|------|--------------|
| `test_access_api.py` | Grant/revoke/round-trip + pagination + search. |
| `test_admin_promotion.py` | Promote/demote, self-demotion 422. |
| `test_enforcement.py` | AdminAuth / AppAccessAuth 401-vs-403 matrix. |
| `test_costs.py` | Cost aggregation + the 503 when no warehouse is configured. |
| `test_jobs.py` | Jobs overview + OBO-then-app-identity fallback (200) + both-denied (403). |
| `test_overview.py` | Overview always 200s; Databricks KPIs degrade to null when disconnected. |

## Conventions & gotchas
- The Databricks SDK client is stubbed — these never hit a real workspace.

## See also
- [admin_portal/](../README.md) · [shell/tests/](../../../shell/tests/README.md)
