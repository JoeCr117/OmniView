import { expect, test } from "@playwright/test";

import { E2E_ADMIN, logIn } from "./helpers";

/** Staff see both apps, which is what lets us test more than one tab at a time. */
const logInAsAdmin = (page: import("@playwright/test").Page) => logIn(page, "/", E2E_ADMIN);

const rail = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Main navigation" });

test("the rail is always on screen, lists apps, and marks where you are", async ({ page }) => {
  await logIn(page);
  const nav = rail(page);

  // No hamburger, no click: the rail is visible from the start.
  await expect(nav.getByRole("link", { name: "Home" })).toBeVisible();

  await nav.getByRole("link", { name: "Expense Tracker" }).click();
  await page.waitForURL(/\/apps\/expense-tracker\/check-book/);

  await expect(page.getByRole("heading", { name: "Check Book" })).toBeVisible();
  await expect(nav).toBeVisible(); // ...and it stays put, unlike the old sheet.
  await expect(nav.getByRole("link", { name: "Expense Tracker" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the rail collapses to icons and remembers it across a reload", async ({ page }) => {
  await logIn(page);
  const nav = rail(page);

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(nav).toHaveAttribute("data-collapsed", "true");

  await page.reload();
  await expect(nav).toHaveAttribute("data-collapsed", "true");

  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(nav).not.toHaveAttribute("data-collapsed", "true");
});

test("opening an app opens a tab; closing the last one falls back to the launcher", async ({
  page,
}) => {
  await logIn(page);

  await expect(page.getByRole("tab")).toHaveCount(0); // Launcher: nothing open.

  await rail(page).getByRole("link", { name: "Expense Tracker" }).click();
  await page.waitForURL(/check-book/);
  await expect(page.getByRole("tab", { name: /Expense Tracker/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("button", { name: "Close Expense Tracker" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("tab")).toHaveCount(0);
});

test("a tab remembers the page you left it on", async ({ page }) => {
  await logIn(page);
  await rail(page).getByRole("link", { name: "Expense Tracker" }).click();
  await page.waitForURL(/check-book/);

  // Move to a different page inside the app, then leave for the launcher.
  await page.getByRole("link", { name: "Daily Trends" }).click();
  await page.waitForURL(/daily-trends/);
  await page.getByRole("link", { name: "OmniView home" }).click();
  await page.waitForURL((url) => url.pathname === "/");

  // Re-selecting the app returns to Daily Trends, not to its front door.
  await page.getByRole("tab", { name: /Expense Tracker/ }).click();
  await page.waitForURL(/daily-trends/);
});

test("two apps stay open at once, and switching between them keeps both tabs", async ({ page }) => {
  await logInAsAdmin(page); // Staff see both apps.
  const nav = rail(page);

  await nav.getByRole("link", { name: "Expense Tracker" }).click();
  await page.waitForURL(/check-book/);
  await expect(page.getByRole("heading", { name: "Check Book" })).toBeVisible();

  await nav.getByRole("link", { name: "Admin Portal" }).click();
  await page.waitForURL(/admin-portal\/overview/);
  await expect(page.getByRole("tab")).toHaveCount(2);
  // Only the focused app is rendered - Next owns the renderer, so switching
  // unmounts the other one. What survives is the tab and its position.
  await expect(page.locator('[data-tab-pane="admin-portal"]')).toBeVisible();

  await page.getByRole("tab", { name: /Expense Tracker/ }).click();
  await page.waitForURL(/check-book/);
  await expect(page.getByRole("heading", { name: "Check Book" })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(2);
});

test("tabs can be dragged into a different order", async ({ page }) => {
  await logInAsAdmin(page);
  const nav = rail(page);

  await nav.getByRole("link", { name: "Expense Tracker" }).click();
  await page.waitForURL(/check-book/);
  await nav.getByRole("link", { name: "Admin Portal" }).click();
  await page.waitForURL(/admin-portal/);

  const order = async () => (await page.getByRole("tab").allInnerTexts()).join(" | ");
  expect(await order()).toMatch(/Expense Tracker[\s\S]*Admin Portal/);

  await page
    .getByRole("tab", { name: /Admin Portal/ })
    .dragTo(page.getByRole("tab", { name: /Expense Tracker/ }));

  await expect.poll(order).toMatch(/Admin Portal[\s\S]*Expense Tracker/);
});
