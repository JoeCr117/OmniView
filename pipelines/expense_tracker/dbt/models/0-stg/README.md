# pipelines/expense_tracker/dbt/models/0-stg/

## Purpose
The staging layer: **source definitions only**. It declares the `stg_*` tables
the Python ingestion staged into `datavault` so downstream models can `ref`/
`source` them. No transformation happens here.

## Role in OmniView
This is dbt's entry point into the data the `banks/` code produced. Bronze models
build directly on these sources. One per-bank subfolder holds each bank's sources.

## Contents
| Item | What it does |
|------|--------------|
| `Golden1/` | Golden1's source definitions (the `stg_Golden1_*` tables). |

## Conventions & gotchas
- Sources point at Python-staged tables that are replaced every run — dbt does
  not build them, it only reads them.

## See also
- [models/](../README.md) · [Golden1/](Golden1/README.md) · [banks/](../../../banks/README.md)
