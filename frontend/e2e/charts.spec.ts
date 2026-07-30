import { expect, test } from "@playwright/test";

import { logIn } from "./helpers";

test("the balance chart is labelled on both axes and answers the pointer", async ({ page }) => {
  await logIn(page, "/apps/expense-tracker/daily-trends");

  const chart = page.getByRole("img", { name: "Total balance over time" });
  await expect(chart).toBeVisible();

  // Both axes carry a title, and the value axis carries its unit - the whole
  // point of the rewrite. The old chart drew gridlines and nothing else.
  await expect(chart.getByText("Date")).toBeVisible();
  await expect(chart.getByText("Balance (USD)")).toBeVisible();

  // Ticks are drawn, and the value axis is formatted as money rather than as
  // raw floats.
  // textContent, not innerText: these are SVG <text> nodes, which have none.
  const tickText = await chart.locator(".recharts-cartesian-axis-tick-value").allTextContents();
  expect(tickText.length).toBeGreaterThan(2);
  expect(tickText.some((t) => t.includes("$"))).toBe(true);

  // Hovering anywhere over the plot raises the crosshair and a tooltip naming
  // the underlying row - no tooltip exists until the pointer is in the chart.
  await expect(page.locator(".recharts-tooltip-cursor")).toHaveCount(0);

  const box = await chart.boundingBox();
  if (!box) throw new Error("chart has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // toBeAttached, not toBeVisible: the crosshair is a zero-width SVG line, and
  // Playwright calls anything with an empty bounding box hidden.
  await expect(page.locator(".recharts-tooltip-cursor")).toBeAttached();

  const tooltip = page.locator(".recharts-tooltip-wrapper");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Total balance");
  await expect(tooltip).toContainText("$"); // ...and the value carries its unit.
});
