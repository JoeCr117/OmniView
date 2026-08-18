import { expect, test } from "@playwright/test";

import { logIn } from "./helpers";

/**
 * The Breakdown report end to end, against the seeded datavault fixture
 * (backend/apps/expense_tracker/tests/data/datavault_schema.sql): six
 * transactions across 2024 and 2025, three account types, and one row with no
 * category.
 *
 * What is asserted here is the wiring the unit tests cannot reach - that the
 * feed arrives over HTTP, that Tabulator and Recharts actually draw, and that a
 * click in one visual changes another.
 */

const BREAKDOWN = "/apps/expense-tracker/breakdown";

test("the tab loads the feed and totals it to the seeded net", async ({ page }) => {
  await logIn(page, BREAKDOWN);
  await expect(page.locator(".tabulator").first()).toBeVisible();

  // Four dates carry the six seeded transactions (2024-01-03 and 2025-02-10
  // hold two each).
  await expect(page.locator(".tabulator-tableholder .tabulator-row")).toHaveCount(4);
  // The footer sums every seeded row: -12.50 -4.50 +25.00 -85.00 +1200.00 -30.00.
  await expect(page.locator(".tabulator")).toContainText("$1,093.00");
  // Both seeded years get a slicer button.
  await expect(page.getByRole("button", { name: "2024" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2025" })).toBeVisible();
});

test("the slicer scopes the page", async ({ page }) => {
  await logIn(page, BREAKDOWN);
  await expect(page.locator(".tabulator").first()).toBeVisible();

  await page.getByRole("button", { name: "2025" }).click();

  // 2025 holds one date, with both of that day's transactions on it.
  await expect(page.locator(".tabulator-tableholder .tabulator-row")).toHaveCount(1);
  await expect(page.locator(".tabulator")).toContainText("$1,170.00");
});

test("both charts draw, and the waterfall closes with a total", async ({ page }) => {
  await logIn(page, BREAKDOWN);

  await expect(page.getByRole("img", { name: "Transactions by Year" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Expenses by Category" })).toBeVisible();
  // 2024, 2025 and the closing Total. Counted rather than read: Recharts puts
  // tick text in a nested layer, so the tick element itself has no text.
  await expect(page.locator(".recharts-bar-rectangle")).toHaveCount(3);
});

test("the waterfall switches to the category axis", async ({ page }) => {
  await logIn(page, BREAKDOWN);
  await expect(page.getByRole("img", { name: "Transactions by Year" })).toBeVisible();

  await page.getByRole("button", { name: "Category", exact: true }).click();

  await expect(page.getByRole("img", { name: "Transactions by Category" })).toBeVisible();
});

test("the matrix drills from dates to labels and back", async ({ page }) => {
  await logIn(page, BREAKDOWN);
  await expect(page.locator(".tabulator").first()).toBeVisible();
  await expect(page.locator(".tabulator")).toContainText("CalendarDate");

  await page.getByRole("button", { name: /next level/i }).first().click();

  await expect(page.locator(".tabulator")).toContainText("Label");
  await expect(page.locator(".tabulator")).toContainText("Uncategorized");

  await page.getByRole("button", { name: "Drill up" }).first().click();

  await expect(page.locator(".tabulator")).toContainText("CalendarDate");
});

test("clicking a pie slice filters the matrix, and Restart puts it back", async ({ page }) => {
  await logIn(page, BREAKDOWN);
  await expect(page.locator(".tabulator").first()).toBeVisible();

  const restart = page.getByRole("button", { name: /Restart/ });
  await expect(restart).toBeDisabled();

  // The seed's spend is Car (-127.50 across Fuel and Insurance) and the one
  // uncategorized row (-4.50); Car is the larger, so it is the first sector.
  //
  // Dispatched rather than clicked: a pie sector's bounding-box centre is the
  // pie's centre, a vertex every slice shares, so a real click there is
  // ambiguous and hangs on actionability. The click path itself is covered by
  // CategoryPieChart's unit tests; what matters here is that the page reacts.
  await page.locator(".recharts-pie-sector path").first().dispatchEvent("click");

  await expect(restart).toBeEnabled();
  await expect(page.locator(".tabulator")).toContainText("($127.50)");

  await restart.click();

  await expect(restart).toBeDisabled();
  await expect(page.locator(".tabulator")).toContainText("$1,093.00");
});

test("ctrl-clicking an account header cross-filters, and sorting still works", async ({ page }) => {
  await logIn(page, BREAKDOWN);
  await expect(page.locator(".tabulator").first()).toBeVisible();

  const header = page.locator('.tabulator-col[tabulator-field="values.CreditCard"]');
  const restart = page.getByRole("button", { name: /Restart/ });

  // A PLAIN click sorts and must not filter: Tabulator owns that gesture, which
  // is why the cross-filter hangs on a modifier. `headerSortClickElement:
  // "icon"` moves the sort onto the arrow so the two never both fire.
  await header.locator(".tabulator-col-sorter").click();
  await expect(restart).toBeDisabled();

  await header.locator(".tabulator-col-title").click({ modifiers: ["Control"] });

  await expect(restart).toBeEnabled();
  await expect(header).toHaveClass(/matrix-selected/);
  await expect(page.getByText(/Filtered by/)).toContainText("CreditCard");
});

test("selections from two visuals compose, and Restart clears both", async ({ page }) => {
  await logIn(page, BREAKDOWN);
  await expect(page.locator(".tabulator").first()).toBeVisible();

  const restart = page.getByRole("button", { name: /Restart/ });
  const chip = page.getByText(/Filtered by/);

  await page
    .locator('.tabulator-col[tabulator-field="values.CreditCard"] .tabulator-col-title')
    .click({ modifiers: ["Control"] });
  await expect(chip).toContainText("CreditCard");

  // Ctrl extends ACROSS visuals - the reference report's compound selection.
  // A plain click here would replace the matrix's selection instead.
  await page
    .locator(".recharts-bar-rectangle")
    .first()
    .dispatchEvent("click", { ctrlKey: true });

  await expect(chip).toContainText("CreditCard");
  await expect(chip).toContainText("2024");

  await restart.click();

  await expect(restart).toBeDisabled();
  await expect(chip).toHaveCount(0);
  await expect(
    page.locator('.tabulator-col[tabulator-field="values.CreditCard"]'),
  ).not.toHaveClass(/matrix-selected/);
});

test("Restart enables on a drill that filters nothing, and undoes it", async ({ page }) => {
  await logIn(page, BREAKDOWN);
  await expect(page.locator(".tabulator").first()).toBeVisible();

  const restart = page.getByRole("button", { name: /Restart/ });
  await expect(restart).toBeDisabled();

  // "Next level" descends without filtering, so nothing about the DATA changes
  // - which is exactly the case the old Restart could not see, because drill
  // state lived inside the visual rather than on the page.
  await page.getByRole("button", { name: /next level/i }).first().click();
  await expect(page.locator(".tabulator")).toContainText("Label");

  await expect(restart).toBeEnabled();

  await restart.click();

  await expect(restart).toBeDisabled();
  await expect(page.locator(".tabulator")).toContainText("CalendarDate");
});

test("the page fits its pane without a horizontal scrollbar", async ({ page }) => {
  await logIn(page, BREAKDOWN);
  await expect(page.locator(".tabulator").first()).toBeVisible();

  // Three linked visuals are read together; a sideways scrollbar means one of
  // them is off screen while the reader looks at another.
  const overflow = await page.evaluate(() => {
    const pane = document.querySelector("[data-tab-pane]");
    if (!pane) return null;
    return {
      horizontal: pane.scrollWidth > pane.clientWidth + 1,
      document: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

  expect(overflow).toEqual({ horizontal: false, document: false });
});
