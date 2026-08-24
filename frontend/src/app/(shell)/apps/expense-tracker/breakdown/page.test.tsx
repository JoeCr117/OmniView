import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BreakdownRow } from "@/apps/expense-tracker/lib/api";
import { __clearResourceCache } from "@/lib/useResource";

import BreakdownPage from "./page";

/**
 * The page's own job, tested without Tabulator or Recharts: fetch once, scope by
 * the slicers, route cross-filter selections between the visuals, and reset.
 *
 * The three visuals are replaced by stand-ins that report the rows they were
 * given and can raise a selection, because what is being asserted here is the
 * wiring - each visual's own behaviour is tested where it lives.
 */

const ROWS: BreakdownRow[] = [
  row("2024-01-15", "Food", -10),
  row("2025-02-20", "Food", -30),
  row("2025-03-01", "Rent", -1000),
  row("2025-04-01", "Income", 2000),
];

function row(calendar_date: string, category: string, amount: number): BreakdownRow {
  return {
    date_sk: Number(calendar_date.replaceAll("-", "")),
    calendar_date,
    account_type: "CreditCard",
    category,
    sub_category: `${category}Sub`,
    label: `${category}Label`,
    amount,
  };
}

const getBreakdown = vi.hoisted(() => vi.fn());

vi.mock("@/apps/expense-tracker/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/apps/expense-tracker/lib/api")>()),
  getBreakdown,
}));

/** Each stand-in shows its row count and can raise a selection on the given dimension. */
function standIn(name: string, dim: string, key: string) {
  return function StandIn({
    rows,
    highlightKeys,
    onSelect,
  }: {
    rows: readonly BreakdownRow[];
    highlightKeys?: readonly string[];
    onSelect?: (criterion: { dim: string; key: string }, extend: boolean) => void;
  }) {
    return (
      <section aria-label={name}>
        <span>rows:{rows.length}</span>
        <span>bright:{(highlightKeys ?? []).join("|")}</span>
        <button onClick={() => onSelect?.({ dim, key }, false)}>select {name}</button>
      </section>
    );
  };
}

vi.mock("@/apps/expense-tracker/components/BreakdownMatrix", () => ({
  BreakdownMatrix: standIn("matrix", "category", "Rent"),
}));
vi.mock("@/apps/expense-tracker/components/BreakdownWaterfall", () => ({
  BreakdownWaterfall: standIn("waterfall", "year", "2025"),
}));
vi.mock("@/apps/expense-tracker/components/BreakdownPie", () => ({
  BreakdownPie: standIn("pie", "category", "Food"),
}));

function rowCount(visual: string): number {
  const text = within(screen.getByLabelText(visual)).getByText(/^rows:/).textContent ?? "";
  return Number(text.replace("rows:", ""));
}

beforeEach(() => {
  // useResource caches at module scope, so each test must start cold.
  __clearResourceCache();
  getBreakdown.mockResolvedValue(ROWS);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Breakdown page", () => {
  it("fetches the feed once and hands every visual the same rows", async () => {
    render(<BreakdownPage />);

    expect(await screen.findByLabelText("matrix")).toBeInTheDocument();
    expect(getBreakdown).toHaveBeenCalledTimes(1);
    expect(rowCount("matrix")).toBe(ROWS.length);
    expect(rowCount("waterfall")).toBe(ROWS.length);
    expect(rowCount("pie")).toBe(ROWS.length);
  });

  it("offers a slicer button per year in the data", async () => {
    render(<BreakdownPage />);
    await screen.findByLabelText("matrix");

    expect(screen.getByRole("button", { name: "2024" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2025" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2023" })).not.toBeInTheDocument();
  });

  it("scopes every visual when a year is picked", async () => {
    const user = userEvent.setup();
    render(<BreakdownPage />);
    await screen.findByLabelText("matrix");

    await user.click(screen.getByRole("button", { name: "2024" }));

    expect(rowCount("matrix")).toBe(1);
    expect(rowCount("pie")).toBe(1);
  });

  it("disables months with no data under the chosen year", async () => {
    const user = userEvent.setup();
    render(<BreakdownPage />);
    await screen.findByLabelText("matrix");

    await user.click(screen.getByRole("button", { name: "2024" }));

    expect(screen.getByRole("button", { name: "January" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "March" })).toBeDisabled();
  });

  it("cross-filters the other visuals but never the one that was clicked", async () => {
    const user = userEvent.setup();
    render(<BreakdownPage />);
    await screen.findByLabelText("matrix");

    await user.click(screen.getByRole("button", { name: "select pie" }));

    // Two Food rows; the pie keeps everything, or it would collapse to one slice.
    expect(rowCount("matrix")).toBe(2);
    expect(rowCount("waterfall")).toBe(2);
    expect(rowCount("pie")).toBe(ROWS.length);
  });

  it("dims only inside the visual that made the selection", async () => {
    const user = userEvent.setup();
    render(<BreakdownPage />);
    await screen.findByLabelText("matrix");

    await user.click(screen.getByRole("button", { name: "select waterfall" }));

    expect(within(screen.getByLabelText("waterfall")).getByText("bright:2025")).toBeInTheDocument();
    expect(within(screen.getByLabelText("pie")).getByText("bright:")).toBeInTheDocument();
  });

  it("names the active selection", async () => {
    const user = userEvent.setup();
    render(<BreakdownPage />);
    await screen.findByLabelText("matrix");

    await user.click(screen.getByRole("button", { name: "select pie" }));

    expect(screen.getByText("Food")).toBeInTheDocument();
  });

  it("keeps Restart disabled until there is something to clear, then clears both filters", async () => {
    const user = userEvent.setup();
    render(<BreakdownPage />);
    await screen.findByLabelText("matrix");

    const restart = screen.getByRole("button", { name: /Restart/ });
    expect(restart).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "2024" }));
    await user.click(screen.getByRole("button", { name: "select pie" }));
    expect(restart).toBeEnabled();
    expect(rowCount("matrix")).toBe(1);

    await user.click(restart);

    expect(restart).toBeDisabled();
    expect(rowCount("matrix")).toBe(ROWS.length);
  });

  it("surfaces a failed fetch with a retry rather than an empty page", async () => {
    getBreakdown.mockRejectedValue(new Error("boom"));
    render(<BreakdownPage />);

    expect(await screen.findByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
