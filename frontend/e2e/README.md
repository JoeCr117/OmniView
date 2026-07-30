# frontend/e2e/

## Purpose
The Playwright end-to-end suite: real-browser tests that drive the built static
export against an isolated backend, covering the flows unit tests can't — login,
navigation/tabs, charts, dark mode, fullscreen, legacy redirects, the Admin
Portal.

## Role in OmniView
`npm run e2e` builds the export, serves the dedicated `omniview_e2e` Postgres
database on port 8100, and runs these specs. They are the last gate before a
milestone is called done (alongside pytest + vitest).

## Contents
| Item | What it does |
|------|--------------|
| `helpers.ts` | Login helpers + the E2E user/admin credentials. |
| `login.spec.ts` | Sign-in + gating. |
| `navigation.spec.ts` | Rail visibility/active-marking, tabs open/close/reorder, "returns you where you left it". |
| `charts.spec.ts` | Axis titles + `$` ticks + crosshair + cursor tooltip. |
| `check-book.spec.ts` | The checkbook grid renders real rows. |
| `admin-portal.spec.ts` | Grant/revoke round-trip; non-admin API 403. |
| `omni-erd.spec.ts` | Diagram draws; column modes; edge integrity; flyout; focus; search; layout + mode persistence. |
| `dark-mode.spec.ts` · `fullscreen.spec.ts` · `legacy-redirect.spec.ts` | Theme, viewport fullscreen, old-URL 301s. |

## Conventions & gotchas
- **Saved state leaks between tests.** Everything signs in as the same account
  against one database, and Omni-ERD persists column mode and node positions per
  user - so a test that switches mode silently changes the starting conditions
  of every test after it. `omni-erd.spec.ts` resets that state in `beforeEach`;
  anything else that writes user preferences must do the same.
- **Never assert on React Flow geometry in screen pixels.** The diagram re-fits
  on load, so the same stored position lands elsewhere on screen. Read the
  node's own `translate(...)` transform, which is in flow coordinates.
- **A canvas node cannot be clicked positionally.** It pans, and the toolbars
  overlay parts of it; click in-page via `evaluate` and target by `data-testid`.
- Port 8100 (e2e), never 8000 (production container) or 8010 (compose dev).
- SVG assertions use `textContent`/`toBeAttached` — SVG nodes have no `innerText`
  and zero-box elements read as "hidden".
- Needs the compose `db` running.

## See also
- [frontend/AGENTS.md](../AGENTS.md) · `docs/DEPLOYMENT.md` "End-to-end tests" · [src/test/](../src/test/README.md)
