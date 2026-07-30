import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { describe, expect, it, vi } from "vitest";

import { Header } from "./Header";

function renderHeader(props: Partial<Parameters<typeof Header>[0]> = {}) {
  const onToggleFullscreen = vi.fn();
  const onToggleRail = vi.fn();
  render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <Header
        isFullscreen={false}
        onToggleFullscreen={onToggleFullscreen}
        railCollapsed={false}
        onToggleRail={onToggleRail}
        {...props}
      />
    </ThemeProvider>,
  );
  return { onToggleFullscreen, onToggleRail };
}

describe("Header", () => {
  it("renders the wordmark linking home", () => {
    renderHeader();
    expect(screen.getByRole("link", { name: "OmniView home" })).toHaveAttribute("href", "/");
  });

  it("renders the non-functional search box", () => {
    renderHeader();
    const search = screen.getByLabelText("Search (not yet functional)");
    expect(search).toHaveAttribute("readonly");
  });

  it("renders the rail toggle and user menu triggers", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: "Collapse navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open user menu" })).toBeInTheDocument();
  });

  it("collapses the rail rather than opening a menu (the rail is always on screen)", async () => {
    const { onToggleRail } = renderHeader();
    await userEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(onToggleRail).toHaveBeenCalledTimes(1);
  });

  it("flips the rail toggle label once collapsed", () => {
    renderHeader({ railCollapsed: true });
    expect(screen.getByRole("button", { name: "Expand navigation" })).toBeInTheDocument();
  });

  it("fires the fullscreen toggle from the maximize button", async () => {
    const { onToggleFullscreen } = renderHeader();
    await userEvent.click(screen.getByRole("button", { name: "Enter full screen" }));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it("flips the maximize button label while fullscreen", () => {
    renderHeader({ isFullscreen: true });
    expect(screen.getByRole("button", { name: "Exit full screen" })).toBeInTheDocument();
  });
});
