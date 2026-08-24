import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  CategoryPieChart,
  foldToPalette,
  sliceLabelText,
  type PieSliceDatum,
} from "./CategoryPieChart";

// Recharts draws nothing when its container measures zero, which is what jsdom
// reports for every element.
beforeAll(() => {
  for (const dimension of ["offsetWidth", "clientWidth"]) {
    Object.defineProperty(HTMLElement.prototype, dimension, { configurable: true, value: 800 });
  }
  for (const dimension of ["offsetHeight", "clientHeight"]) {
    Object.defineProperty(HTMLElement.prototype, dimension, { configurable: true, value: 400 });
  }
});

const SLICES: PieSliceDatum[] = [
  { key: "Rent", label: "Rent", value: 600, pct: 60 },
  { key: "Food", label: "Food", value: 300, pct: 30 },
  { key: "Car", label: "Car", value: 100, pct: 10 },
];

function slice(count: number, from = 0): PieSliceDatum[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `k${from + i}`,
    label: `L${from + i}`,
    value: 100 - i,
    pct: 1,
  }));
}

function renderChart(overrides: Partial<Parameters<typeof CategoryPieChart>[0]> = {}) {
  return render(
    <CategoryPieChart ariaLabel="Expenses by Category" slices={SLICES} {...overrides} />,
  );
}

function sectors(container: HTMLElement) {
  return [...container.querySelectorAll(".recharts-pie-sector path")];
}

describe("foldToPalette", () => {
  it("leaves a palette-sized list alone", () => {
    expect(foldToPalette(slice(8))).toHaveLength(8);
    expect(foldToPalette(SLICES)).toEqual(SLICES);
  });

  it("folds the tail into one Other rather than inventing a ninth hue", () => {
    const folded = foldToPalette(slice(11));
    expect(folded).toHaveLength(9);
    expect(folded[8]).toMatchObject({ key: "__other__", label: "Other (3)" });
  });

  it("Other carries the whole tail's value and share, so the total still adds up", () => {
    const many: PieSliceDatum[] = [
      ...slice(8),
      { key: "x", label: "X", value: 30, pct: 3 },
      { key: "y", label: "Y", value: 20, pct: 2 },
    ];
    const folded = foldToPalette(many);
    expect(folded.at(-1)).toMatchObject({ value: 50, pct: 5 });
  });

  it("never mutates the list it is given", () => {
    const original = slice(10);
    foldToPalette(original);
    expect(original).toHaveLength(10);
  });
});

describe("sliceLabelText", () => {
  const rent: PieSliceDatum = { key: "Rent", label: "Rent", value: 600, pct: 60 };
  const usd = (v: number) => `$${v}`;

  it("writes name, value and share when there is room", () => {
    expect(sliceLabelText(rent, 250, usd)).toBe("Rent $600 (60%)");
  });

  it("falls back to the share alone when there is not", () => {
    // The legacy report's full string needs about half a screen; squeezed into
    // a narrow pane it clips against the edge and its neighbours.
    expect(sliceLabelText(rent, 80, usd)).toBe("60%");
  });

  it("says nothing at all for a sliver, at any width", () => {
    const sliver: PieSliceDatum = { key: "S", label: "S", value: 1, pct: 1 };
    expect(sliceLabelText(sliver, 400, usd)).toBeNull();
    expect(sliceLabelText(sliver, 40, usd)).toBeNull();
  });
});

describe("CategoryPieChart", () => {
  it("describes itself with the caller's label", () => {
    renderChart({ ariaLabel: "Expenses by SubCategory" });
    expect(screen.getByRole("img", { name: "Expenses by SubCategory" })).toBeInTheDocument();
  });

  it("shows an empty state rather than an empty circle", () => {
    renderChart({ slices: [], emptyMessage: "No expenses." });
    expect(screen.getByText("No expenses.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("draws one sector per slice", () => {
    const { container } = renderChart();
    expect(sectors(container)).toHaveLength(SLICES.length);
  });

  it("assigns the categorical slots in fixed order", () => {
    const { container } = renderChart();
    const fills = sectors(container).map((sector) => sector.getAttribute("fill"));
    expect(fills).toEqual([
      "var(--chart-cat-1)",
      "var(--chart-cat-2)",
      "var(--chart-cat-3)",
    ]);
  });

  it("paints the folded tail a neutral, because Other is not a category", () => {
    const { container } = renderChart({ slices: slice(10) });
    const fills = sectors(container).map((sector) => sector.getAttribute("fill"));
    expect(fills).toHaveLength(9);
    expect(fills.at(-1)).toBe("var(--chart-other)");
  });

  it("labels only the slices big enough to read, and names them in the legend regardless", () => {
    const mixed: PieSliceDatum[] = [
      { key: "Big", label: "Big", value: 900, pct: 90 },
      { key: "Sliver", label: "Sliver", value: 10, pct: 1 },
    ];
    renderChart({ slices: mixed, format: (v) => `$${v}` });

    expect(screen.getByText("Big $900 (90%)")).toBeInTheDocument();
    expect(screen.queryByText(/Sliver \$10/)).not.toBeInTheDocument();
    // Identity is never colour-alone: the sliver is still in the legend.
    expect(screen.getByText("Sliver")).toBeInTheDocument();
  });

  it("orders the legend like the chart, largest first", () => {
    // Recharts orders a derived legend alphabetically, which explains the chart
    // in an order the chart does not use.
    const { container } = renderChart();
    const names = [...container.querySelectorAll(".recharts-legend-item-text")].map(
      (node) => node.textContent,
    );
    expect(names).toEqual(["Rent", "Food", "Car"]);
  });

  it("reports the clicked slice", async () => {
    const onSelect = vi.fn();
    const { container } = renderChart({ onSelect });

    await userEvent.click(sectors(container)[1]);

    expect(onSelect).toHaveBeenCalledWith("Food", false);
  });

  it("reports that the reader was extending when a modifier is held", async () => {
    const onSelect = vi.fn();
    const { container } = renderChart({ onSelect });

    // One session: userEvent only carries a held key across calls made through
    // the same setup() instance.
    const user = userEvent.setup();
    await user.keyboard("{Shift>}");
    await user.click(sectors(container)[1]);
    await user.keyboard("{/Shift}");

    expect(onSelect).toHaveBeenCalledWith("Food", true);
  });

  it("ignores clicks on Other, which is an aggregate and cannot filter to anything", async () => {
    const onSelect = vi.fn();
    const { container } = renderChart({ slices: slice(10), onSelect });

    await userEvent.click(sectors(container).at(-1) as Element);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("dims the slices outside the highlighted set", () => {
    const { container } = renderChart({ highlightKeys: ["Food"] });
    const opacities = sectors(container).map((sector) => sector.getAttribute("fill-opacity"));
    expect(opacities).toEqual(["0.3", "1", "0.3"]);
  });
});
