import { expect, type Page } from "@playwright/test";

/** The accounts e2e_bootstrap creates (backend/config/settings/e2e.py):
 * `e2e` is a regular user granted expense-tracker; `e2e-admin` is staff. */
export const E2E_USER = { username: "e2e", password: "e2e-password!" };
export const E2E_ADMIN = { username: "e2e-admin", password: "e2e-admin-password!" };

/**
 * Signs in through the real login form. Starts at `next`, rides Django's
 * redirect to /login (auth is always on under the e2e settings), and lands
 * back on `next` after the session is established.
 */
export async function logIn(page: Page, next = "/", account = E2E_USER): Promise<void> {
  await page.goto(next);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Username").fill(account.username);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === next);
}
