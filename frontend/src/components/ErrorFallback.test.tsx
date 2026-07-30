import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorFallback } from "./ErrorFallback";
import ShellError from "@/app/(shell)/error";

const reportClientError = vi.fn();
vi.mock("@/lib/log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/log")>();
  return {
    ...actual,
    reportClientError: (source: string, error: unknown) => reportClientError(source, error),
  };
});

beforeEach(() => {
  reportClientError.mockClear();
});

describe("ErrorFallback", () => {
  it("renders the message + digest and reports once", () => {
    const error = Object.assign(new Error("kaboom"), { digest: "abc123" });
    render(<ErrorFallback error={error} retry={() => {}} source="shell-error-boundary" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError).toHaveBeenCalledWith("shell-error-boundary", error);
  });

  it("wires Try again to the retry callback", async () => {
    const retry = vi.fn();
    render(<ErrorFallback error={new Error("x")} retry={retry} source="s" />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("shell error boundary", () => {
  it("passes Next 16's unstable_retry through as the retry action", async () => {
    const unstableRetry = vi.fn();
    render(<ShellError error={new Error("segment blew up")} unstable_retry={unstableRetry} />);
    expect(reportClientError).toHaveBeenCalledWith(
      "shell-error-boundary",
      expect.objectContaining({ message: "segment blew up" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(unstableRetry).toHaveBeenCalledTimes(1);
  });
});
