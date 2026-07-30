import { expect, test } from "@playwright/test";

import { logIn } from "./helpers";

test("launcher card opens Check Book with the seeded Tabulator rows", async ({
  page,
}) => {
  await logIn(page);
  await page.getByRole("main").getByRole("link", { name: /Expense Tracker/ }).click();
  await page.waitForURL(/\/apps\/expense-tracker\/check-book/);

  // The three gold_Golden1_DailyMetrics fixture rows (data rows live in the
  // tableholder; the bottomCalc total row is a .tabulator-row too, but in
  // the footer).
  await expect(page.locator(".tabulator-tableholder .tabulator-row")).toHaveCount(3);
  // Accounting-formatted TotalBalance from the seed data.
  await expect(page.locator(".tabulator")).toContainText("$1,637.50");
  // The year slicer derives from the same rows.
  await expect(page.getByRole("button", { name: "2024" })).toBeVisible();
});
