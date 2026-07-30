import { defineConfig, devices } from "@playwright/test";

/**
 * OmniView E2E suite. Run via `npm run e2e`, which builds the static export
 * first - the webServer below serves it production-style (Django serving
 * frontend/out + /api/* on one port) against the isolated `omniview_e2e`
 * Postgres database (dropped/recreated, migrated, and seeded by the
 * e2e_bootstrap management command; the real `omniview` database and the
 * production Data/ tree are never touched).
 *
 * Prerequisite: the compose Postgres server must be running -
 * `docker compose -f docker/docker-compose.yml up -d db` (bootstrap fails with that hint otherwise).
 *
 * Port 8100 on purpose: 8000 belongs to the user's production container.
 */
export default defineConfig({
  testDir: "./e2e",
  // One shared Django server and login; specs are cheap, so run them serially
  // rather than juggling per-worker sessions.
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "uv run python manage.py e2e_bootstrap && uv run python manage.py runserver 8100 --noreload",
    cwd: "../backend",
    env: { DJANGO_SETTINGS_MODULE: "config.settings.e2e" },
    // /login 200s only once frontend/out exists - a missing build fails here
    // instead of as confusing 404s inside the specs.
    url: "http://127.0.0.1:8100/login",
    // Never reuse: whatever already listens on 8100 is a dev server pointed
    // at real data, not the bootstrapped scratch environment.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
