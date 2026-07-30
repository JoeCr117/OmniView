# frontend/src/app/(auth)/

## Purpose
The chrome-less route group — pages shown before sign-in, with no header, rail,
or tabs. Today that's just the login page.

## Role in OmniView
A Next.js route group (parentheses = no URL segment) that gives sign-in its own
minimal layout, distinct from the `(shell)` dashboard layout. Django redirects
unauthenticated users here.

## Contents
| Item | What it does |
|------|--------------|
| `login/` | The login page + its test. |
| `layout.tsx` | The bare, centered layout for auth screens. |
| `error.tsx` | Error boundary for this group. |

## Conventions & gotchas
- Deliberately free of shell chrome — don't add header/rail here.
- Azure auto-login and the logout loop-guard live in the login page (see
  `lib/auth.tsx` `SKIP_SSO_AUTO_LOGIN_KEY`).

## See also
- [app/](../README.md) · [login/](login/README.md) · [(shell)/](<../(shell)/README.md>)
