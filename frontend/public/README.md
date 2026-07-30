# frontend/public/

## Purpose
Static assets served verbatim at the site root — the default Next.js placeholder
SVGs. They are copied into the export as-is.

## Role in OmniView
Next.js serves everything here from `/` (e.g. `/next.svg`), and it lands in
`frontend/out/` at build so Django serves it too. Nothing here is imported by
code; it's referenced by URL.

## Contents
| Item | What it does |
|------|--------------|
| `file.svg` `globe.svg` `next.svg` `vercel.svg` `window.svg` | Default Next.js scaffold icons. |

## Conventions & gotchas
- These are scaffold leftovers; real app icons/branding would also live here.
- Anything added here is public and unauthenticated — don't put sensitive assets here.

## See also
- [frontend/AGENTS.md](../AGENTS.md) · [src/app/](../src/app/README.md)
