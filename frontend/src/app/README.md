# frontend/src/app/

## Purpose
The Next.js App Router tree — routes only, and thin. Route *files* map URLs to
pages; the real work lives in `apps/<id>/` and `components/`. Two route groups
separate the chrome-less login from the dashboard shell.

## Role in OmniView
Each `page.tsx` here becomes an exported `.html`; Django serves them and gates
them by URL. The root `layout.tsx` mounts the client providers; error boundaries
catch render failures per group.

## Contents
| Item | What it does |
|------|--------------|
| `(auth)/` | The chrome-less route group: the login page. |
| `(shell)/` | The dashboard route group: header, rail, tabbed viewport, app pages. |
| `layout.tsx` | Root layout: fonts, metadata, the `Providers` client boundary. |
| `globals.css` | Tailwind v4 theme, tokens, dark mode, keyframes (Tabulator CSS imported first). |
| `global-error.tsx` | Top-level error boundary. |
| `favicon.ico` | The tab icon. |

## Conventions & gotchas
- Keep pages thin — a `page.tsx` should compose app components, not hold logic.
- `globals.css` import order matters (Tabulator's stylesheet first, globals last).
- Dark mode is class-based via next-themes — style with tokens, not
  `prefers-color-scheme`.

## See also
- [src/](../README.md) · [(auth)/](<(auth)/README.md>) · [(shell)/](<(shell)/README.md>)
