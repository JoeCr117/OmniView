import { expect, test } from "@playwright/test";

import { E2E_USER, logIn } from "./helpers";

test("anonymous visit bounces to /login and bad credentials show the error", async ({
  page,
}) => {
  // Playwright reports the URL percent-decoded, so match next=/ not next=%2F.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=\/$/);

  await page.getByLabel("Username").fill(E2E_USER.username);
  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();

  // The form's own alert, not Next's route announcer (also role="alert").
  await expect(page.locator("form p[role='alert']")).toHaveText(
    "Invalid username or password.",
  );
  await expect(page).toHaveURL(/\/login/);
});

test("valid credentials land on the app launcher", async ({ page }) => {
  await logIn(page);
  await expect(
    page.getByRole("heading", { name: "Welcome to OmniView" }),
  ).toBeVisible();
  // Scoped to the launcher: the app rail names it too, and this test is about
  // what you land on, not about navigation.
  await expect(
    page.getByRole("main").getByRole("link", { name: /Expense Tracker/ }),
  ).toBeVisible();
});
