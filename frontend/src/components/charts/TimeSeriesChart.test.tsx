import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { TimeSeriesChart } from "./TimeSeriesChart";

// Recharts measures its container and draws nothing at all when that comes back
// zero - which is what jsdom reports for every element. Give it a size, or the
// axes we are here to assert on never render.
beforeAll(() => {
  for (const dimension of ["offsetWidth", "clientWidth"]) {
    Object.defineProperty(HTMLElement.prototype, dimension, { configurable: true, value: 800 });
  }
  for (const dimension of ["offsetHeight", "clientHeight"]) {
    Object.defineProperty(HTMLElement.prototype, dimension, { configurable: true, value: 400 });
  }
});

const points = [
  { x: "2024-01-01", y: 100 },
  { x: "2024-01-02", y: 250 },
  { x: "2024-01-03", y: 175 },
];

function renderChart(overrides: Partial<Parameters<typeof TimeSeriesChart>[0]> = {}) {
  return render(
    <TimeSeriesChart
      ariaLabel="Total balance over time"
      series={[{ key: "balance", label: "Total balance", points }]}
      x={{ label: "Date" }}
      y={{ label: "Balance", unit: "USD" }}
      {...overrides}
    />,
  );
}

describe("TimeSeriesChart", () => {
  it("describes itself with the caller's label, not a hardcoded one", () => {
    // The chart this replaced announced every chart - including the Admin
    // Portal's DBU chart - as "Total balance over time".
    renderChart({ ariaLabel: "Databricks DBU usage per day" });
    expect(screen.getByRole("img", { name: "Databricks DBU usage per day" })).toBeInTheDocument();
  });

  it("labels the value axis with its unit, so the numbers mean something", () => {
    renderChart();
    expect(screen.getByText("Balance (USD)")).toBeInTheDocument();
    expect(screen.getByText("Date")).toBeInTheDocument();
  });

  it("omits the parenthesised unit when there isn't one", () => {
    renderChart({ y: { label: "Count" } });
    expect(screen.getByText("Count")).toBeInTheDocument();
  });

  it("shows an empty state instead of empty axes when there is nothing to plot", () => {
    renderChart({
      series: [{ key: "balance", label: "Total balance", points: [] }],
      emptyMessage: "No usage recorded in this window.",
    });
    expect(screen.getByText("No usage recorded in this window.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
