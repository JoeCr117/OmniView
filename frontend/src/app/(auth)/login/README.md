# frontend/src/app/(auth)/login/

## Purpose
The login page: username/password against Django sessions, plus the optional
"Sign in with Microsoft" (Entra ID) button and env-driven auto-login.

## Role in OmniView
Rendered at `/login`. Calls `useAuth().login`, which posts to `/api/auth/login`
and re-probes `/session`. Reads `AuthConfig` to decide whether to show/auto-run
the Microsoft flow, and honors the logout loop-guard so a deliberate sign-out
doesn't bounce straight back into SSO.

## Contents
| Item | What it does |
|------|--------------|
| `page.tsx` | The login form + Entra ID button + auto-login effect. |
| `page.test.tsx` | Vitest coverage of the form, error state, and auto-login guard. |

## Conventions & gotchas
- It's a static page; Django owns the redirect *to* it. The `?next=` param is
  honored by the AuthProvider's 401 handler, not here.

## See also
- [(auth)/](../README.md) · [lib/auth.tsx](../../../lib/README.md)
