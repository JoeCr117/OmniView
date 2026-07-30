# frontend/src/

## Purpose
All OmniView frontend source: the Next.js App Router routes, the per-app code,
the shared component library, the shell chrome, and the client libs. It builds to
a static export (`frontend/out/`) that Django serves.

## Role in OmniView
This is the entire UI. It talks to the backend only over `/api/*` (via
`lib/http.ts`). The split mirrors the backend's: `apps/<id>/` is one app's code
and nothing else; `components/` holds cross-app UI; `app/` holds thin routes.

## Contents
| Item | What it does |
|------|--------------|
| `app/` | App Router routes (thin): `(auth)/login` chrome-less, `(shell)/` the dashboard. |
| `apps/` | Per-app code + the two registries (`registry.ts`, `access.ts`). |
| `components/` | `ui/` (shadcn), `shell/` (chrome), `common/` (cross-app), `charts/`. |
| `hooks/` | Reusable hooks (`useFullscreen`, `useDebouncedValue`). |
| `lib/` | `http`, `auth`, `tabs`, `useResource`, `log`, `utils`, `navigation`. |
| `test/` | Vitest global setup. |

## Conventions & gotchas
- **TypeScript only** (`.ts`/`.tsx`).
- **Static export**: no middleware, server actions, or `redirects()` — Django
  owns those. Every URL needs an exported `.html`.
- **Apps must not import from other apps** — eslint enforces it; shared code goes
  to `components/common`.

## See also
- [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) · [frontend/AGENTS.md](../AGENTS.md)
- [app/](app/README.md) · [apps/](apps/README.md) · [components/](components/README.md) · [lib/](lib/README.md)
