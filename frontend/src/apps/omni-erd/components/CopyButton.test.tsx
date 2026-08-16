import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "./CopyButton";

/**
 * The fallback path is the reason this component exists: `navigator.clipboard`
 * is absent over plain http, which is a normal way to reach the dev container.
 * Every branch below is a different thing the user is told, and the outcome is
 * announced in a live region rather than by the icon swap alone.
 */

function renderWithFallbackText(text: string | null, fallback = "SELECT 1") {
  const ref = createRef<HTMLElement>();
  render(
    <>
      <p ref={ref as React.RefObject<HTMLParagraphElement>}>{fallback}</p>
      <CopyButton text={text} label="Copy query" fallbackRef={ref} />
    </>,
  );
  return ref;
}

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
  vi.useRealTimers();
});

describe("a successful copy", () => {
  beforeEach(() => stubClipboard(() => Promise.resolve()));

  it("writes the text and says so out loud", async () => {
    renderWithFallbackText("SELECT 1");

    await userEvent.click(screen.getByRole("button", { name: "Copy query" }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("SELECT 1");
    expect(screen.getByRole("status")).toHaveTextContent("Copied.");
  });

  it("returns to idle after the reset delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithFallbackText("SELECT 1");

    await user.click(screen.getByRole("button", { name: "Copy query" }));
    expect(screen.getByRole("status")).toHaveTextContent("Copied.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

describe("when the clipboard write fails", () => {
  beforeEach(() => stubClipboard(() => Promise.reject(new Error("insecure context"))));

  it("selects the text instead and asks for Ctrl-C", async () => {
    renderWithFallbackText("SELECT 1");

    await userEvent.click(screen.getByRole("button", { name: "Copy query" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Clipboard unavailable - the text is selected, press Ctrl-C.",
    );
    expect(document.getSelection()?.toString()).toBe("SELECT 1");
  });

  it("reports plain failure when there is nothing to select either", async () => {
    const ref = createRef<HTMLElement>();
    render(<CopyButton text="SELECT 1" label="Copy query" fallbackRef={ref} />);

    await userEvent.click(screen.getByRole("button", { name: "Copy query" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Copy failed - select the text and press Ctrl-C.",
    );
  });

  it("does not leave the success message up", async () => {
    renderWithFallbackText("SELECT 1");

    await userEvent.click(screen.getByRole("button", { name: "Copy query" }));

    expect(screen.getByRole("status")).not.toHaveTextContent("Copied.");
  });
});

describe("with nothing runnable to copy", () => {
  beforeEach(() => stubClipboard(() => Promise.resolve()));

  it("is aria-disabled but still hoverable, so its explanation is reachable", () => {
    renderWithFallbackText(null);
    const button = screen.getByRole("button", { name: "Copy query" });

    // Not the native `disabled` attribute: buttonVariants sets
    // disabled:pointer-events-none, which would hide the title on hover.
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("title", "No joinable query for this selection");
  });

  it("does nothing when clicked", async () => {
    renderWithFallbackText(null);

    await userEvent.click(screen.getByRole("button", { name: "Copy query" }));

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
