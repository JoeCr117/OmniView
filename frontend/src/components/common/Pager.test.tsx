import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Pager } from "./Pager";

function renderPager(props: Partial<Parameters<typeof Pager>[0]> = {}) {
  const onOffsetChange = vi.fn();
  render(
    <Pager offset={0} limit={25} count={100} onOffsetChange={onOffsetChange} {...props} />,
  );
  return { onOffsetChange };
}

describe("Pager", () => {
  it("shows the current page and total", () => {
    renderPager({ offset: 25 });
    expect(screen.getByText("Page 2 of 4 (100 total)")).toBeInTheDocument();
  });

  it("disables Previous on the first page", () => {
    renderPager();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("disables Next on the last page", () => {
    renderPager({ offset: 75 });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  });

  it("advances by one page on Next", async () => {
    const { onOffsetChange } = renderPager({ offset: 25 });
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onOffsetChange).toHaveBeenCalledWith(50);
  });

  it("goes back by one page on Previous, clamped to zero", async () => {
    const { onOffsetChange } = renderPager({ offset: 10 });
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onOffsetChange).toHaveBeenCalledWith(0);
  });

  it("reports a single page when there are no rows", () => {
    renderPager({ count: 0 });
    expect(screen.getByText("Page 1 of 1 (0 total)")).toBeInTheDocument();
  });
});
