import { expect, test } from "@playwright/test";

import { E2E_ADMIN, logIn } from "./helpers";

test("regular user does not see the Admin Portal but keeps granted apps", async ({ page }) => {
  await logIn(page); // e2e user: granted expense-tracker only
  // The rail and the launcher must agree: a granted app is offered in both, an
  // ungranted one in neither.
  for (const scope of [page.getByRole("main"), page.getByRole("navigation", { name: "Main navigation" })]) {
    await expect(scope.getByRole("link", { name: /expense tracker/i })).toBeVisible();
    await expect(scope.getByRole("link", { name: /admin portal/i })).toHaveCount(0);
  }
});

test("admin sees the portal and manages access", async ({ page }) => {
  await logIn(page, "/", E2E_ADMIN);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: /admin portal/i })
    .click();
  await page.waitForURL("**/apps/admin-portal/overview");

  await page.getByRole("link", { name: "Users & Access" }).click();
  await page.waitForURL("**/apps/admin-portal/users");

  // Both bootstrap accounts are listed with their access state.
  const row = page.locator("tr", { hasText: "e2e@example.com" });
  await expect(row).toBeVisible();
  const grantSwitch = row.getByRole("switch", { name: /expense tracker access/i });
  await expect(grantSwitch).toBeChecked();

  // Revoke and re-grant round-trip against the live API.
  await grantSwitch.click();
  await expect(grantSwitch).not.toBeChecked();
  await grantSwitch.click();
  await expect(grantSwitch).toBeChecked();
});

test("non-admin gets a denial on direct admin-portal API access", async ({ page }) => {
  await logIn(page);
  const response = await page.request.get("/api/admin-portal/users");
  expect(response.status()).toBe(403);
});
