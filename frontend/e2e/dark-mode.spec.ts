import { expect, test } from "@playwright/test";

import { logIn } from "./helpers";

test("dark mode toggle flips the theme and persists across reload", async ({
  page,
}) => {
  await logIn(page);
  const html = page.locator("html");
  // defaultTheme is "system" and headless Chromium reports light.
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("menuitem", { name: "Dark mode" }).click();
  await expect(html).toHaveClass(/dark/);

  // next-themes persists the choice in localStorage.
  await page.reload();
  await expect(html).toHaveClass(/dark/);
});
