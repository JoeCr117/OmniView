# quality/

Objective measurement of the codebase. Every metric here is produced by a tool and carries a unit;
nothing in this directory encodes a style opinion.

Two rules govern this directory:

1. **Discovery precedes enforcement.** Thresholds are set from measured values, never guessed.
2. **Gate on counts in CI, gate on time locally.** Counts (queries, bytes, violations, coverage,
   mutation score) are deterministic. Wall-clock timings are noisy on shared runners and live in
   `baselines/perf/` from a workstation run.

Measurements never read `Data/`. The dynamic tier uses test fixtures and the isolated `omniview_e2e`
database.

## Layout

| Path | What it holds |
|---|---|
| `baselines/` | Committed ratchet values. A check fails when a number gets worse than its baseline. |
| `baselines/openapi.json` | API snapshot for `oasdiff` breaking-change detection. |
| `baselines/perf/` | Locally measured timings. Not produced in CI. |
| `reports/` | Generated output. Only `baseline-audit.md` is committed; raw tool dumps are ignored. |

## Re-running the measurements

All tools run through `uvx` / `npx` and are not project dependencies until adopted as gates.

```powershell
# Lint census
uvx ruff@latest check backend pipelines deploy --statistics

# Complexity (complexipy has a native ratchet: --snapshot-create / --diff <ref>)
uvx complexipy backend pipelines deploy --output quality/reports --output-format json
uvx radon cc backend pipelines deploy -n C -s --total-average
uvx radon mi backend pipelines deploy -n B -s

# Types
uv run --with mypy mypy backend pipelines --ignore-missing-imports

# Architecture contracts
$env:PYTHONPATH = "$PWD;$PWD\backend"
uv run --with import-linter lint-imports --config .importlinter

# Duplication (one tool, both languages)
npx jscpd backend pipelines frontend/src --min-lines 8 --min-tokens 60 `
  --reporters consoleFull,json --output quality/reports/jscpd

# Frontend graph + dead code
cd frontend
npx madge --circular --extensions ts,tsx --ts-config tsconfig.json src
npx knip

# Supply chain
uv run --with pip-audit pip-audit
cd frontend; npm audit; npm outdated

# Test order dependence (three runs must agree)
uv run pytest -q
uv run --with pytest-randomly pytest -q -p randomly --randomly-seed=12345
uv run --with pytest-randomly pytest -q -p randomly --randomly-seed=98765
```

### API fuzzing

Needs the E2E harness. Three things bite, all documented in the audit's "Tool fitness" section:
`PYTHONIOENCODING=utf-8` on Windows, authentication supplied as a raw `Cookie:` header, and
`--exclude-path /api/auth/logout` — without it Schemathesis destroys its own session and every
subsequent request 401s.

```powershell
docker compose -f docker/docker-compose.yml up -d db
cd backend; $env:DJANGO_SETTINGS_MODULE='config.settings.e2e'
uv run python manage.py e2e_bootstrap
uv run python manage.py runserver 8100 --noreload
# then log in as e2e-admin (see config/settings/e2e.py) and pass the session cookie:
uv run --with schemathesis schemathesis run http://127.0.0.1:8100/api/openapi.json `
  --header "Cookie: sessionid=<sid>; csrftoken=<csrf>" --header "X-CSRFToken: <csrf>" `
  --exclude-path '/api/auth/logout' --exclude-path '/api/auth/login' --max-examples 20
```

## Tools deliberately not adopted

- **`vulture`** — 350 findings, effectively zero actionable. Django/Ninja/Pydantic declarative code
  and pytest fixture injection all read as dead to it.

See `reports/baseline-audit.md` for the measured values and the reasoning.
