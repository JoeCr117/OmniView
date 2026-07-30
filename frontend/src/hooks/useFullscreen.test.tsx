import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useFullscreen } from "./useFullscreen";

function Harness() {
  const { ref, isFullscreen, toggle } = useFullscreen<HTMLDivElement>();
  return (
    <div>
      <div ref={ref} data-testid="target" />
      <span data-testid="state">{String(isFullscreen)}</span>
      <button onClick={() => void toggle()}>toggle</button>
    </div>
  );
}

// jsdom has no Fullscreen API - emulate the parts the hook touches.
let fullscreenEl: Element | null = null;
// Set through a helper so the mock below can hand over its `this` without
// aliasing it to a variable first.
const setFullscreenEl = (el: Element | null) => {
  fullscreenEl = el;
};

beforeEach(() => {
  fullscreenEl = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenEl,
  });
  HTMLElement.prototype.requestFullscreen = vi.fn(function (this: HTMLElement) {
    setFullscreenEl(this);
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  });
  document.exitFullscreen = vi.fn(() => {
    setFullscreenEl(null);
    document.dispatchEvent(new Event("fullscreenchange"));
    return Promise.resolve();
  });
});

describe("useFullscreen", () => {
  it("starts out of fullscreen", () => {
    render(<Harness />);
    expect(screen.getByTestId("state")).toHaveTextContent("false");
  });

  it("toggle enters fullscreen on the ref'd element", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("state")).toHaveTextContent("true");
    expect(fullscreenEl).toBe(screen.getByTestId("target"));
  });

  it("toggle exits when already fullscreen", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "toggle" }));
    await userEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("state")).toHaveTextContent("false");
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("tracks exits made outside the hook (Esc / browser chrome)", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "toggle" }));
    act(() => {
      fullscreenEl = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(screen.getByTestId("state")).toHaveTextContent("false");
  });

  it("stays out of fullscreen when the browser rejects the request", async () => {
    HTMLElement.prototype.requestFullscreen = vi.fn(() =>
      Promise.reject(new TypeError("Permission denied")),
    );
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("state")).toHaveTextContent("false");
  });
});
