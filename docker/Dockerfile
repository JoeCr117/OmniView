# syntax=docker/dockerfile:1
#
# IMPORTANT: this file lives in docker/ but its build context is the REPO ROOT.
# Every COPY below is written relative to the repo root, not to this directory.
# docker-compose.yml sets that up with `context: ..` + `dockerfile: docker/Dockerfile`.
# Building by hand requires the same: `docker build -f docker/Dockerfile .`
# (note the trailing `.`). The exclusion list, .dockerignore, is read from the
# context root - i.e. the repo root - and so must stay there, not live here.

# ---- Stage 1: Next.js static export ----
# Next 16 requires Node >= 20.9; 22 is the active LTS (20 went EOL 2026-04).
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python runtime (backend + pipeline + served frontend) ----
FROM python:3.13-slim AS backend
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
COPY backend/ ./backend/
# The ETL. Kept at /app (not under backend/) because the web layer runs it as a
# subprocess from the repo root - `python -m pipelines.<app>.main` - rather than
# importing it. See backend/shell/pipeline.py.
COPY pipelines/ ./pipelines/
# Container startup script. Copied explicitly because it lives in docker/ (the
# home for every Docker file) rather than arriving inside COPY backend/.
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN uv sync --frozen --no-dev

# Static export copied straight into the export dir Django's frontend view
# reads from (see backend/config/frontend.py / FRONTEND_EXPORT_DIR).
COPY --from=frontend-build /app/frontend/out ./frontend/out

ENV DJANGO_SETTINGS_MODULE=config.settings.local

# Collects Django Ninja's Swagger UI assets (and admin's) into STATIC_ROOT so
# config/urls.py's static route can serve them - see config/urls.py's comment
# on why gunicorn needs an explicit route rather than relying on `runserver`'s
# DEBUG-only auto-serving.
RUN cd backend && uv run --no-dev python manage.py collectstatic --noinput

EXPOSE 8000
# The entrypoint waits for Postgres, ensures the omniview/datavault schemas,
# migrates, and optionally creates the first superuser from DJANGO_SUPERUSER_*
# envs before starting gunicorn. Invoked via `sh` because Windows checkouts
# don't carry the executable bit (.gitattributes pins the script to LF).
ENTRYPOINT ["sh", "docker/entrypoint.sh"]
