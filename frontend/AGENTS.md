<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# OmniView frontend conventions

This is the OmniView dashboard shell (see root `CLAUDE.md` and `docs/HANDOFF.md`).
Rules that bite if ignored:

- **TypeScript only** — all code and configs are `.ts`/`.tsx`, never `.js`/`.jsx`.
- **Static export** (`output: "export"`): no middleware, no server actions, no
  `redirects()`. Django serves `out/` and owns redirects/auth gating; the API
  is the security boundary.
- Where things live (full contract: `docs/ARCHITECTURE.md`):
  - `src/components/ui/` — shadcn primitives.
  - `src/components/shell/` — OmniView's chrome (Header, Sidebar, AppSubnav…).
  - `src/components/common/` — **cross-app** components (DataTable, Pager,
    AsyncState, KpiCard, skeletons); `src/components/charts/` — chart primitives.
  - `src/apps/<app-id>/` — that app's code and nothing else; pages under
    `src/app/(shell)/apps/<app-id>/`.
  - New dashboard apps register in `src/apps/registry.ts` (launcher, sidebar,
    subnav) — and on the backend in `shell/registry.py`; a test asserts the two
    agree on app ids.
- **Apps must not import from other apps** — eslint enforces this
  (`import/no-restricted-paths`). If two apps need it, promote it to
  `components/common`; if one does, keep it in that app. The Admin Portal used
  to import out of the ExpenseTracker package; that's what the rule prevents.
- All API calls go through `src/lib/http.ts` (`apiFetch`) — it owns
  credentials, CSRF headers, and the 401 unauthorized event. Exception: the
  log shipper in `src/lib/log.ts` deliberately uses raw fetch (a failing log
  POST must never trigger the logout redirect).
- Errors: use `reportClientError` / the shared `ErrorFallback`; Next 16 error
  boundaries take `unstable_retry` (not `reset`).
- CSS: Tailwind v4 (CSS-first, no tailwind.config); `globals.css` import order
  matters (Tabulator's stylesheet first, globals last). Dark mode is
  class-based via next-themes — style with tokens, not `prefers-color-scheme`.
- Tests: Vitest (`npm run test`, specs `src/**/*.test.{ts,tsx}`) and
  Playwright E2E (`npm run e2e`, specs in `e2e/*.spec.ts` — isolated scratch
  backend on port 8100; port 8000 is the user's production container).
