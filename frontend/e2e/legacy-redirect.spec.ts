import { expect, test } from "@playwright/test";

import { logIn } from "./helpers";

test("legacy page URLs answer with a 301 to the app namespace", async ({
  page,
}) => {
  const response = await page.request.get("/check-book", { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers()["location"]).toBe("/apps/expense-tracker/check-book");
});

test("a signed-in browser visit to a legacy URL lands on the new page", async ({
  page,
}) => {
  await logIn(page);
  await page.goto("/check-book");
  await expect(page).toHaveURL(/\/apps\/expense-tracker\/check-book/);
  await expect(page.getByRole("heading", { name: "Check Book" })).toBeVisible();
});
