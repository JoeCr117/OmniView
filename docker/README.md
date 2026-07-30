# docker/

## Purpose
Everything Docker-related for OmniView lives here. Docker gives you the project's
**local development and test environment**: a Postgres database server and,
optionally, the whole application running exactly as it does in production —
without installing Postgres, Node.js, or Python on your machine by hand.

This directory is **not** how OmniView is deployed to production. Production runs
on Databricks Apps and uses no Docker at all (see
[deploy/databricks/](../deploy/databricks/README.md)).

This README is written for someone who has never used Docker. If you already know
Docker, skip to [Command cookbook](#command-cookbook).

---

## Docker from zero

### What problem does Docker solve?

The app needs Python 3.13, Node.js 22, Postgres 17, and a couple of dozen
libraries at exact versions. Installing those directly on your machine is slow,
easy to get wrong, and collides with other projects. Docker packages each piece
into an isolated, disposable box that already has the right versions inside.

### The four words you need

| Term | What it means | Analogy |
|---|---|---|
| **Image** | A read-only, immutable template: a filesystem plus a start command. Built once from a `Dockerfile`. | A program installer, or a class in code. |
| **Container** | A running instance of an image. Disposable — delete it and rebuild from the image any time. | The running program, or an object instance. |
| **Volume** | Storage that lives *outside* any container, so data survives when the container is deleted. | An external hard drive you unplug and re-plug. |
| **Service** | One named container defined in `docker-compose.yml`, plus how it is configured and wired to others. | One entry in a startup script. |

The critical consequence: **containers are disposable, volumes are not.** Deleting
this project's `app` container costs you nothing. Deleting its `db` *volume*
destroys your local database.

### Acronyms used in this project's Docker files

- **PG** — PostgreSQL, the database. The `PG*` environment variables
  (`PGHOST`, `PGUSER`, `PGPASSWORD`, …) are the libpq standard, understood by
  virtually every Postgres client.
- **libpq** — the official PostgreSQL client library, which defines those variable names.
- **WSGI** — *Web Server Gateway Interface*, the Python standard that lets a web
  server call a Python web application. `config.wsgi:application` is our entry point.
- **gunicorn** — *Green Unicorn*, the production WSGI server that runs Django here.
  Django's own `runserver` is for development only and is not used inside the image.
- **ETL** — *Extract, Transform, Load*: the data pipeline that reads bank CSVs,
  categorizes them, and builds the analysis tables.
- **CSV** — *Comma-Separated Values*, the bank export format.
- **dbt** — *data build tool*, which builds the SQL analysis layers.
- **SQL** — *Structured Query Language*.
- **CLI** — *Command-Line Interface*.
- **LTS** — *Long-Term Support*, a release with an extended maintenance window.
- **LF** — *Line Feed*, the Unix newline character. Contrast **CRLF**
  (*Carriage Return + Line Feed*), the Windows newline.

---

## Role in OmniView

Docker plays **two distinct roles**, and it matters which one you are using.

### Role 1 — the database server (the important one)

Even when you run the app directly on your machine, the *database* almost always
comes from Docker. Starting just the `db` service:

```powershell
docker compose -f docker/docker-compose.yml up -d db
```

publishes Postgres on `127.0.0.1:5432` with database/user/password
`omniview` / `omniview` / `omniview-dev`. Those exact values are the built-in
defaults in three places, which is why everything works with zero configuration:

- `backend/config/settings/base.py` → `pg_database()` (Django)
- `pipelines/common/postgres.py` (the ETL pipeline)
- `pipelines/expense_tracker/dbt/profiles.yml` (dbt)

**Three workflows depend on this and will fail without it:**

1. Running Django on the host — `cd backend && uv run python manage.py runserver`
2. Running the pipeline or dbt — `uv run python -m pipelines.expense_tracker.main`
3. The Playwright end-to-end test suite — `cd frontend && npm run e2e`, which
   creates and drops its own `omniview_e2e` database on this server

If those three keep working, you rarely need Role 2 at all.

### Role 2 — the whole application

```powershell
docker compose -f docker/docker-compose.yml up -d
```

builds and runs the complete app at `http://127.0.0.1:8010` — the closest local
approximation of production. Useful for verifying a change end-to-end before
deploying, and for reproducing "works on my machine" problems.

> **Port 8000 is reserved.** It belongs to a separate, pre-existing production
> container. This stack deliberately publishes **8010**, and the test suite uses
> **8100**. Never bind 8000.

---

## Contents

| Item | What it does |
|------|--------------|
| `Dockerfile` | The recipe for building the application image (see the walkthrough below). |
| `docker-compose.yml` | Defines and wires the two services, `db` and `app`. |
| `entrypoint.sh` | Runs inside the container at startup: wait for Postgres → create schemas → migrate → optionally create an admin → start gunicorn. |
| `.env` | **Not in git.** Optional local secrets/overrides. Create it here if you need one; see [Environment variables](#environment-variables). |

One related file deliberately lives **outside** this directory:

| Item | Why it is not here |
|------|--------------------|
| `../.dockerignore` | Docker reads it from the *build context* root (the repo root), never from beside the Dockerfile. Moving it here would silently stop it working — see the gotchas. |

---

## The Dockerfile, walked through

It is a **multi-stage build**: two separate build environments, where the second
copies just the finished output of the first. This keeps Node.js out of the final
image entirely.

### Stage 1 — build the frontend

```dockerfile
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build
```

`FROM` picks the starting image — Node.js 22 (the active LTS), `-slim` being a
smaller variant. `WORKDIR` sets the working directory for everything after it.
`npm run build` produces a **static export**: plain HTML/CSS/JS files in
`frontend/out/`, with no Node.js server needed at runtime.

**Why `package*.json` is copied before the rest of the source:** Docker caches
each instruction as a *layer* and reuses it while its inputs are unchanged.
Dependencies change far less often than source code, so copying the manifest and
running `npm ci` first means editing a component re-runs only the last two lines
instead of reinstalling every dependency. The same trick appears in stage 2 with
`pyproject.toml`/`uv.lock`.

### Stage 2 — the Python runtime

```dockerfile
FROM python:3.13-slim AS backend
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
COPY backend/ ./backend/
COPY pipelines/ ./pipelines/
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN uv sync --frozen --no-dev
COPY --from=frontend-build /app/frontend/out ./frontend/out
```

- `rm -rf /var/lib/apt/lists/*` in the *same* `RUN` discards the package index in
  the same layer that created it. A separate `RUN` would leave it baked into the
  image forever — layers are additive and deleting in a later one does not shrink it.
- `uv` is the Python package manager; `--frozen` installs exactly what `uv.lock`
  pins, and `--no-dev` skips test-only dependencies.
- `COPY --from=frontend-build` is the multi-stage payoff: it takes only the built
  static files from stage 1. Node.js and `node_modules` never reach the final image.
- The final layout at `/app` **deliberately mirrors the repo layout**, because
  Django's settings compute paths by walking up from their own file, and the
  pipeline is launched as `python -m pipelines.expense_tracker.main` from `/app`.

```dockerfile
RUN cd backend && uv run --no-dev python manage.py collectstatic --noinput
EXPOSE 8000
ENTRYPOINT ["sh", "docker/entrypoint.sh"]
```

- `collectstatic` gathers Django's admin and API-documentation assets into one
  directory so gunicorn can serve them. (`runserver` does this automatically in
  debug mode; gunicorn does not.)
- `EXPOSE` is **documentation only** — it publishes nothing. `docker-compose.yml`'s
  `ports:` is what actually opens a port.
- `ENTRYPOINT` is the command run when a container starts. It is invoked via `sh`
  because Windows checkouts do not preserve the Unix executable bit.

### `entrypoint.sh`, step by step

1. **Wait for Postgres.** Retries `manage.py ensure_schemas` up to 30 times, 2
   seconds apart. Compose's healthcheck usually handles ordering, but a bare
   `docker run` has no such guarantee. This also creates the two schemas
   (`omniview` and `datavault`) if missing.
2. **`migrate --noinput`** — applies Django database migrations. `--noinput` means
   never prompt, since nobody is at a keyboard.
3. **Optionally create an admin** from `DJANGO_SUPERUSER_*` if those variables are
   set. Trailing `|| true` keeps restarts idempotent (the command errors if the
   user already exists, and that is fine).
4. **`exec gunicorn …`** — `exec` *replaces* the shell process rather than
   spawning a child, so gunicorn becomes process 1 and receives stop signals
   directly. Without it, `docker compose down` would take ten seconds longer and
   then kill the container. `--timeout 600` is required because the Rebuild button
   runs the entire ETL pipeline inside one request; gunicorn's 30-second default
   would kill the worker mid-rebuild.

---

## docker-compose.yml, walked through

`docker compose` runs several containers together from one file.

```yaml
name: omniview
```

The **project name**. Compose groups containers, networks and volumes under it,
and *derives it from this file's parent directory when unset* — which, with this
file in `docker/`, would silently make the project `docker` and point the database
at a different (empty) volume. Pinning it removes that trap. **Do not remove it.**

The database volume avoids the prefix entirely by declaring its own `name:` (see
the volumes block at the bottom of the file), so renaming the project no longer
moves the data. That matters because the volume is **deployment-level
infrastructure, not any one app's**: it holds the shell's `auth_user`,
`django_session` and SSO tables and the Admin Portal's grants alongside
ExpenseTracker's data. Per-app isolation lives a layer above it, in the
`omniview` / `datavault` schemas and `backend/config/db_router.py`.

> **History:** this project was called `expensetracker` until 2026-07-19, when the
> repo was renamed to OmniView. The data was copied from the old
> `expensetracker_omniview-pgdata` volume into the prefix-free `omniview-pgdata`
> and row counts verified. If you have an old checkout, that stale volume may
> still exist — `docker volume rm expensetracker_omniview-pgdata` once you're sure.

### The `db` service

```yaml
db:
  image: postgres:17-alpine
  environment:
    POSTGRES_DB: omniview
    POSTGRES_USER: omniview
    POSTGRES_PASSWORD: ${PGPASSWORD:-omniview-dev}
  volumes:
    - omniview-pgdata:/var/lib/postgresql/data
  ports:
    - "127.0.0.1:5432:5432"
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U omniview -d omniview"]
```

- `image:` pulls a prebuilt image instead of building one. `alpine` is a very
  small Linux base.
- `${PGPASSWORD:-omniview-dev}` means "use `PGPASSWORD` if set, otherwise
  `omniview-dev`".
- The `volumes:` line is **where your data actually lives**: the named volume
  `omniview-pgdata` is mounted at Postgres's data directory. It survives
  `docker compose down` and is destroyed only by `down -v`.
- `"127.0.0.1:5432:5432"` maps `hostPort:containerPort`. The `127.0.0.1` prefix
  binds to your machine only, so the database is not exposed to your network.
- The `healthcheck` runs `pg_isready` on a loop; the `app` service waits for it to
  pass before starting.

### The `app` service

```yaml
app:
  build:
    context: ..
    dockerfile: docker/Dockerfile
  depends_on:
    db:
      condition: service_healthy
  environment:
    PGHOST: db
    …
  env_file:
    - path: .env
      required: false
  ports:
    - "${OMNIVIEW_PORT:-8010}:8000"
```

- **`context: ..`** — the *build context* is the set of files Docker can `COPY`.
  Everything in the Dockerfile is written relative to the repo root, so the
  context must be the repo root (one level up from here), even though the
  Dockerfile itself lives in this directory. The short form `build: .` would make
  `docker/` the context and every `COPY` would fail with "not found in build
  context".
- **`PGHOST: db`** — inside Compose's private network, each service is reachable
  by its service name. The app finds the database at the hostname `db`. On your
  machine, the same server is `127.0.0.1`.
- `depends_on … service_healthy` waits for the healthcheck, not merely for the
  container to exist.
- `"${OMNIVIEW_PORT:-8010}:8000"` — the app listens on 8000 *inside* the
  container, published as 8010 on your machine.
- There are deliberately **no volumes on `app`**: all state, including uploaded
  CSVs and the budget map, lives in Postgres, so the app container is stateless
  and safe to destroy.

---

## Command cookbook

Run these from the **repo root**, and from **PowerShell, not Git Bash** — MSYS
shells rewrite Windows paths inside Docker arguments and produce confusing errors.

The `-f docker/docker-compose.yml` flag is needed because the file is no longer at
the repo root. To avoid typing it, set it once per shell session:

```powershell
$env:COMPOSE_FILE = "docker/docker-compose.yml"
```

| Command | What it does |
|---|---|
| `docker compose -f docker/docker-compose.yml up -d db` | **Most common.** Start only Postgres, for host-side dev, the pipeline, and E2E tests. |
| `docker compose -f docker/docker-compose.yml up -d` | Start the full stack; app on `http://127.0.0.1:8010`. |
| `docker compose -f docker/docker-compose.yml up -d --build` | Same, but rebuild the image first. **Required after changing backend or frontend code** — the image is a snapshot and does not track your files. |
| `docker compose -f docker/docker-compose.yml ps` | List the services and their health. |
| `docker compose -f docker/docker-compose.yml logs -f app` | Follow the app's logs (gunicorn access lines + pipeline output). `Ctrl+C` stops watching, not the container. |
| `docker compose -f docker/docker-compose.yml exec app sh` | Open a shell *inside* the running app container. |
| `docker compose -f docker/docker-compose.yml exec db psql -U omniview` | Open a SQL prompt against the database. |
| `docker compose -f docker/docker-compose.yml stop` | Stop containers, keep them and the data. |
| `docker compose -f docker/docker-compose.yml down` | Stop **and delete** the containers. Data is kept — the volume is untouched. |
| `docker compose -f docker/docker-compose.yml down -v` | ⚠️ **Destroys the database volume.** Every locally imported bank row is gone and must be re-imported. Rarely what you want. |
| `docker compose -f docker/docker-compose.yml config` | Print the fully-resolved configuration. The fastest way to check that `.env` and paths are being picked up. |

### First boot

The image contains no bank files, so load the source data once from the host —
host and container share the same Postgres server:

```powershell
cd backend
uv run python manage.py import_banks_dir ..\Data\Banks
```

Then build the analysis tables, either from the app (Budget page → **Rebuild**) or
from the repo root:

```powershell
uv run python -m pipelines.expense_tracker.main
```

---

## Environment variables

All optional. Set them in **`docker/.env`** (gitignored, beside `docker-compose.yml`).

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | insecure dev value | **Set in any real deployment.** Django's signing key for sessions and CSRF tokens. |
| `OMNIVIEW_PORT` | `8010` | Host port for the app. Do not set this to 8000. |
| `DJANGO_SUPERUSER_USERNAME` / `_EMAIL` / `_PASSWORD` | unset | First-boot admin account; ignored once that user exists. |
| `OMNIVIEW_AUTH_REQUIRED` | `1` (on) | `0` runs the app with no login. Escape hatch only. |
| `OMNIVIEW_ADMIN_EMAILS` | unset | Comma-separated emails auto-granted admin. |
| `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID` | unset / unset / `common` | Microsoft Entra ID single sign-on. Setting the client ID enables the Microsoft button. |
| `AZURE_AUTO_LOGIN` | `0` | `1` sends anonymous visitors straight into the Microsoft flow. |
| `LOG_LEVEL` | `INFO` | Backend log verbosity (DEBUG/INFO/WARNING/ERROR). |
| `LOG_DIR` | unset | Also write a rotating `omniview.log` under this path. |
| `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` / `PGSSLMODE` | compose defaults | libpq connection settings. Compose sets `PGHOST=db` for the app container; everything else uses the dev defaults. |

---

## Conventions & gotchas

- **`.dockerignore` must stay at the repo root, not here.** Docker resolves it
  from the build-context root. Moved into `docker/`, it is silently ignored, and
  `.venv/`, `node_modules/`, and — importantly — the production `Data/` tree would
  all be swept into the build context: a much slower build that also copies real
  financial data into the image.
- **`.env` must live here, beside `docker-compose.yml`, not at the repo root.**
  Compose resolves `${VAR}` substitutions from its *project directory*, which
  defaults to the compose file's own directory. A root-level `.env` would still be
  injected into the container by the `env_file:` line, but would **not** feed those
  substitutions — so `OMNIVIEW_PORT` and `PGPASSWORD` would quietly keep their
  defaults. Keeping one file here avoids that split. Confirm with
  `docker compose -f docker/docker-compose.yml config`.
- **`env_file` has `required: false`**, so a wrong path fails *silently*. If a
  variable seems ignored, check `config` output before anything else.
- **Code changes need `--build`.** An image is a snapshot; the running container
  does not see your edits until you rebuild.
- **`entrypoint.sh` must keep LF line endings.** `.gitattributes` pins `*.sh` to
  LF. With Windows CRLF endings, Linux reports a cryptic "no such file or
  directory" for the interpreter.
- **PowerShell, not Git Bash.** MSYS path translation mangles Docker arguments.
- **Never bind port 8000** — it belongs to the separate production container.
  This stack uses 8010, and the E2E suite uses 8100.
- **Docker is not the production deployment.** Production is Databricks Apps,
  which builds a source bundle and never touches an image. Changing anything here
  has no effect on production.

## See also
- [Repo root](../README.md) · [deploy/databricks/](../deploy/databricks/README.md) (the real deployment)
- `docs/DEPLOYMENT.md` — the full runbook, including Databricks and the E2E tier.
- `docs/ARCHITECTURE.md` — what lives where and why.
- [backend/](../backend/README.md) · [frontend/](../frontend/src/README.md) · [pipelines/](../pipelines/README.md)
