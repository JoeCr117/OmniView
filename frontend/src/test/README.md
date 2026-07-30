# frontend/src/test/

## Purpose
Vitest global setup: the jsdom shims and stubs every component test relies on
(matchMedia, ResizeObserver, pointer/scroll APIs) plus Testing Library cleanup.

## Role in OmniView
Referenced by the Vitest config as the setup file, so it runs before every spec.
Its most load-bearing piece is a `ResizeObserver` stub that **reports a size** —
Recharts draws nothing at 0×0, which is what jsdom reports for everything, so a
no-op stub would silently turn every chart assertion into "no SVG rendered".

## Contents
| Item | What it does |
|------|--------------|
| `setup.ts` | jsdom shims (matchMedia, sized ResizeObserver, pointer APIs) + `afterEach(cleanup)`. |

## Conventions & gotchas
- Don't downgrade the ResizeObserver stub back to a no-op — chart tests depend on
  it reporting a viewport.

## See also
- [src/](../README.md) · [components/charts/](../components/charts/README.md)
