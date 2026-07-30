import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Without vitest globals, Testing Library can't self-register its cleanup.
afterEach(() => cleanup());

// jsdom implements neither matchMedia nor ResizeObserver; next-themes,
// Radix (shadcn) and Tabulator all expect them to exist.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// A ResizeObserver that reports a size. jsdom measures everything as 0x0, and
// Recharts draws nothing at 0x0 - so a no-op stub here silently turns every
// chart assertion into "no SVG rendered". Reporting a plausible viewport on
// observe() is what lets charts be tested at all.
const OBSERVED_SIZE = { width: 800, height: 400 };

class ResizeObserverStub implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    const rect = { ...OBSERVED_SIZE, top: 0, left: 0, bottom: 400, right: 800, x: 0, y: 0 };
    this.callback(
      [{ target, contentRect: rect } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = window.ResizeObserver ?? ResizeObserverStub;

// Radix primitives (dropdown-menu, sheet, ...) call these pointer/scroll
// APIs, none of which jsdom implements.
window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView ?? vi.fn();
window.HTMLElement.prototype.hasPointerCapture = window.HTMLElement.prototype.hasPointerCapture ?? vi.fn();
window.HTMLElement.prototype.setPointerCapture = window.HTMLElement.prototype.setPointerCapture ?? vi.fn();
window.HTMLElement.prototype.releasePointerCapture =
  window.HTMLElement.prototype.releasePointerCapture ?? vi.fn();
