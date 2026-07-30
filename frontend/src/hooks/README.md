# frontend/src/hooks/

## Purpose
Reusable React hooks that aren't tied to any one app or the data layer: native
fullscreen, and value debouncing.

## Role in OmniView
`useFullscreen` powers the viewport's maximize button (fullscreens `#app-viewport`
so tabs survive). `useDebouncedValue` collapses a burst of input into one value —
the Users & Access search feeds its debounced value into a `useResource` key so
typing isn't one request per keystroke.

## Contents
| Item | What it does |
|------|--------------|
| `useFullscreen.ts` | Fullscreen a ref'd element via the native API; reflects Esc/chrome exits. |
| `useDebouncedValue.ts` | Returns a value delayed by N ms, resetting on each change. |
| `useOverlayContainer.ts` | The element a portalled overlay must render into to survive fullscreen. |
| `useReducedMotion.ts` | Whether the OS asked for minimal animation. |
| `*.test.*` | Cover the first two (debounce uses fake timers). |

## Conventions & gotchas
- **Both new hooks are `useSyncExternalStore`, not `useState` + `useEffect`.**
  They read something outside React (a media query, the DOM), and mirroring that
  into state from an effect is the cascading render the React compiler rejects
  outright (`Calling setState synchronously within an effect`).
- **`useOverlayContainer` exists because of one specific trap**: Radix portals
  to `document.body`, but `#app-viewport` is the fullscreen target - so an
  overlay attached to body is invisible in fullscreen and fine everywhere else.
- The data-fetching cache is **not** here — that's `lib/useResource.ts`.

## See also
- [src/](../README.md) · [lib/](../lib/README.md) · [components/shell/](../components/shell/README.md)
