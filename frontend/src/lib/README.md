# frontend/src/lib/

## Purpose
The client's non-visual core: the fetch layer, auth context, the tabs model, the
read cache, logging, routing helpers, and small utilities. These are the modules
every app and component builds on.

## Role in OmniView
`http.ts` is the single door to the backend (credentials, CSRF, the 401 event);
everything else fetches through it. `auth.tsx` owns the session and boots in one
round-trip via `/api/auth/session`. `tabs.tsx` owns which apps are open (URL stays
the source of truth for the focused tab). `useResource.ts` is the SWR cache that
keeps pages from blanking.

## Contents
| Item | What it does |
|------|--------------|
| `http.ts` | `apiFetch` + `apiUpload` (XHR upload progress); CSRF, credentials, 401 event. |
| `auth.tsx` | `AuthProvider`/`useAuth`; 1-RTT `/session` boot; login/logout. |
| `tabs.tsx` | `TabsProvider`/`useTabs`; open apps + order + last href; localStorage-persisted. |
| `useResource.ts` | Stale-while-revalidate cache: skeleton→content, no blanking, shared keys, dedupe. |
| `log.ts` | loglevel + a shipper to `POST /api/logs/frontend` (raw fetch, never triggers logout). |
| `navigation.ts` · `utils.ts` | Route helpers + `cn` etc. |
| `*.test.*` | Cover http/auth/tabs/log/useResource. |

## Conventions & gotchas
- All API calls go through `apiFetch`/`apiUpload`; the log shipper is the one
  deliberate exception (a failing log POST must not log the user out).
- `useResource` cache is module-scoped: survives unmounts, resets on full reload.

## See also
- [src/](../README.md) · [hooks/](../hooks/README.md) · [components/common/](../components/common/README.md)
