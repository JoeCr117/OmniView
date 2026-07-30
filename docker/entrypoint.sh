#!/bin/sh
# Container startup (runs from /app - see Dockerfile ENTRYPOINT).
#
# Django's own tables (auth/sessions) and the source-data tables live in the
# Postgres `omniview` schema; dbt builds into `datavault`. ensure_schemas
# creates both schemas idempotently and doubles as the wait-for-db probe -
# compose's healthcheck usually gates startup, but a plain `docker run` has
# no ordering guarantee.
set -e

tries=0
until uv run --no-dev python backend/manage.py ensure_schemas; do
    tries=$((tries + 1))
    if [ "$tries" -ge 30 ]; then
        echo "Postgres at ${PGHOST:-127.0.0.1}:${PGPORT:-5432} not reachable, giving up" >&2
        exit 1
    fi
    echo "Waiting for Postgres (attempt $tries)..."
    sleep 2
done

uv run --no-dev python backend/manage.py migrate --noinput

# Must follow migrate, and must run as the app. migrate creates new tables owned
# by whichever identity ran it; in the cloud that is a service principal that is
# replaced on every app recreate, leaving its tables unreadable by the successor.
# Only the creator may reassign them, so this is the one moment it can be fixed.
# No-ops locally, where the shared role does not exist. The dbt on-run-end hook
# does the same for `datavault`.
#
# `|| true` deliberately, and note this script runs under `set -e`: ownership
# drift makes the *next* app recreate painful but breaks nothing today, so
# refusing to boot over it would turn a latent problem into an outage.
uv run --no-dev python backend/manage.py ensure_ownership || true

# First-boot convenience: create the initial admin account when the
# DJANGO_SUPERUSER_USERNAME/EMAIL/PASSWORD env vars are set. createsuperuser
# exits nonzero if the user already exists - `|| true` keeps restarts
# idempotent.
if [ -n "${DJANGO_SUPERUSER_USERNAME:-}" ]; then
    uv run --no-dev python backend/manage.py createsuperuser --noinput || true
fi

# --timeout: POST /api/expense-tracker/budgets/rebuild runs the full dbt
# pipeline synchronously in the request; gunicorn's default 30s would kill
# the worker mid-rebuild.
exec uv run --no-dev gunicorn config.wsgi:application \
    --chdir backend \
    --bind 0.0.0.0:8000 \
    --timeout 600 \
    --access-logfile -
