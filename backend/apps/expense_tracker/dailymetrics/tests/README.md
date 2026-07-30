# backend/apps/expense_tracker/dailymetrics/tests/

## Purpose
Tests for the DailyMetrics read API.

## Role in OmniView
Confirms the endpoint paginates, filters by date, and serializes the gold
DailyMetrics shape the frontend expects (Check Book / Daily Trends).

## Contents
| Item | What it does |
|------|--------------|
| `test_api.py` | List/pagination/date-filter + response-shape assertions. |

## Conventions & gotchas
- The unit tier seeds the gold relation from `datavault_schema.sql` (SQLite), so
  no pipeline run is needed.

## See also
- [dailymetrics/](../README.md) · [expense_tracker/tests/](../../tests/README.md)
