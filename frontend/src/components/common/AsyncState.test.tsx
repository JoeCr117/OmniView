import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorState, Loading } from "./AsyncState";

describe("Loading", () => {
  it("announces itself to assistive tech while the fetch is in flight", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("accepts a caller-supplied label", () => {
    render(<Loading label="Rebuilding…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Rebuilding…");
  });
});

describe("ErrorState", () => {
  it("announces the failure message via role=alert", () => {
    render(<ErrorState message="API /api/x failed: 500" onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to load: API /api/x failed: 500",
    );
  });

  it("invokes onRetry when Retry is clicked", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="boom" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
