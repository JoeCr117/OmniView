# frontend/src/components/

## Purpose
Every React component that is *not* a route or a single app's private code: the
shadcn primitives, OmniView's chrome, the cross-app component library, and the
one chart component. Plus the top-level providers and error fallback.

## Role in OmniView
This is the boundary that keeps apps from leaking into each other. If two apps
need a component it lives in `common/` (or `ui`/`charts`); if one app needs it, it
stays in `apps/<id>/`. The Admin Portal once imported ExpenseTracker's
`AsyncState`/`Pager`/`LineChart` — that's exactly what this folder prevents.

## Contents
| Item | What it does |
|------|--------------|
| `ui/` | shadcn primitives (generated; edit sparingly). |
| `shell/` | OmniView's chrome: Header, AppRail, TabBar, ViewportPane, AppSubnav, UserMenu. |
| `common/` | Cross-app components: DataTable, Pager, AsyncState, KpiCard, skeletons, progress. |
| `charts/` | The one chart (`TimeSeriesChart`), its lazy wrapper, LTTB downsampling. |
| `providers.tsx` | Theme → Auth → Tabs context stack. |
| `ClientInit.tsx` | Client-only bootstrap (logging init). |
| `ErrorFallback.tsx` | Shared render-error fallback (Next 16 `unstable_retry`). |

## Conventions & gotchas
- Cross-app promotion is the rule: shared → `common`, private → `apps/<id>`.
- `providers.tsx` order matters: Tabs depends on Auth (which apps a user may open).

## See also
- [src/](../README.md) · [ui/](ui/README.md) · [shell/](shell/README.md) · [common/](common/README.md) · [charts/](charts/README.md)
