import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { WaterfallChart, type WaterfallDatum } from "./WaterfallChart";

// Recharts measures its container and draws nothing at all when that comes back
// zero - which is what jsdom reports for every element. Give it a size, or the
// axes and bars we are here to assert on never render.
beforeAll(() => {
  for (const dimension of ["offsetWidth", "clientWidth"]) {
    Object.defineProperty(HTMLElement.prototype, dimension, { configurable: true, value: 800 });
  }
  for (const dimension of ["offsetHeight", "clientHeight"]) {
    Object.defineProperty(HTMLElement.prototype, dimension, { configurable: true, value: 400 });
  }
});

const BARS: WaterfallDatum[] = [
  { key: "2024", label: "2024", delta: -600, start: 0, end: -600, kind: "decrease" },
  { key: "2025", label: "2025", delta: 400, start: -600, end: -200, kind: "increase" },
  { key: "__total__", label: "Total", delta: -200, start: 0, end: -200, kind: "total" },
];

function renderChart(overrides: Partial<Parameters<typeof WaterfallChart>[0]> = {}) {
  return render(
    <WaterfallChart
      ariaLabel="Transactions by Year"
      bars={BARS}
      x={{ label: "Year" }}
      y={{ label: "Transactions", unit: "USD" }}
      {...overrides}
    />,
  );
}

function bars(container: HTMLElement) {
  return [...container.querySelectorAll(".recharts-bar-rectangle path")];
}

describe("WaterfallChart", () => {
  it("describes itself with the caller's label", () => {
    renderChart({ ariaLabel: "Transactions by Category" });
    expect(screen.getByRole("img", { name: "Transactions by Category" })).toBeInTheDocument();
  });

  it("titles both axes and carries the value unit", () => {
    renderChart();
    expect(screen.getByText("Transactions (USD)")).toBeInTheDocument();
    expect(screen.getByText("Year")).toBeInTheDocument();
  });

  it("omits the parenthesised unit when there isn't one", () => {
    renderChart({ y: { label: "Count" } });
    expect(screen.getByText("Count")).toBeInTheDocument();
  });

  it("shows an empty state instead of empty axes when there is nothing to plot", () => {
    renderChart({ bars: [], emptyMessage: "Nothing to show." });
    expect(screen.getByText("Nothing to show.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("draws one bar per datum", () => {
    const { container } = renderChart();
    expect(bars(container)).toHaveLength(BARS.length);
  });

  it("colours by direction: green up, red down, primary for the total", () => {
    const { container } = renderChart();
    const fills = bars(container).map((bar) => bar.getAttribute("fill"));
    expect(fills).toEqual(["var(--chart-4)", "var(--chart-2)", "var(--chart-1)"]);
  });

  it("labels each bar with its contribution, not its cumulative position", () => {
    // The 2025 bar ends at -200 but contributes +400; the label must say +400.
    // Scoped to the label list because the axis ticks carry these numbers too.
    const { container } = renderChart({
      y: { label: "Transactions", unit: "USD", format: (v) => `${v}` },
    });
    const labels = [...container.querySelectorAll(".recharts-label-list text")].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(["-600", "400", "-200"]);
  });

  it("connects each bar's end to the next bar's start, but not to the Total", () => {
    const { container } = renderChart();
    // Two steps and a total: exactly one connector, between the two steps.
    expect(container.querySelectorAll(".recharts-reference-line")).toHaveLength(1);
  });

  it("reports the clicked bar's key", async () => {
    const onSelect = vi.fn();
    const { container } = renderChart({ onSelect });

    await userEvent.click(bars(container)[1]);

    expect(onSelect).toHaveBeenCalledWith("2025", false);
  });

  it("reports that the reader was extending when a modifier is held", async () => {
    // Recharts' click handlers do not carry modifier keys, so the chart reads
    // them off the native event on the way down.
    const onSelect = vi.fn();
    const { container } = renderChart({ onSelect });

    // One session: userEvent only carries a held key across calls made through
    // the same setup() instance.
    const user = userEvent.setup();
    await user.keyboard("{Control>}");
    await user.click(bars(container)[1]);
    await user.keyboard("{/Control}");

    expect(onSelect).toHaveBeenCalledWith("2025", true);
  });

  it("dims the bars outside the highlighted set", () => {
    const { container } = renderChart({ highlightKeys: ["2025"] });
    const opacities = bars(container).map((bar) => bar.getAttribute("fill-opacity"));
    expect(opacities).toEqual(["0.3", "1", "0.3"]);
  });

  it("keeps several bars bright for a multi-selection", () => {
    const { container } = renderChart({ highlightKeys: ["2024", "2025"] });
    const opacities = bars(container).map((bar) => bar.getAttribute("fill-opacity"));
    expect(opacities).toEqual(["1", "1", "0.3"]);
  });

  it("leaves every bar at full strength when nothing is highlighted", () => {
    const { container } = renderChart();
    expect(bars(container).map((bar) => bar.getAttribute("fill-opacity"))).toEqual(["1", "1", "1"]);
    const empty = renderChart({ highlightKeys: [] });
    expect(bars(empty.container).map((bar) => bar.getAttribute("fill-opacity"))).toEqual([
      "1",
      "1",
      "1",
    ]);
  });

  it("drops the value labels once there are too many bars to read them", () => {
    // Twelve months plus a total overlap into a smear; the tooltip still has
    // the exact number, so nothing a reader could have read is lost.
    const many = Array.from({ length: 12 }, (_, i) => ({
      key: `m${i}`,
      label: `M${i}`,
      delta: 100,
      start: i * 100,
      end: (i + 1) * 100,
      kind: "increase" as const,
    }));
    const { container } = renderChart({ bars: many });
    expect(container.querySelectorAll(".recharts-label-list text")).toHaveLength(0);
  });

  it("lets the caller override that default", () => {
    const { container } = renderChart({ showValueLabels: false });
    expect(container.querySelectorAll(".recharts-label-list text")).toHaveLength(0);
  });
});
