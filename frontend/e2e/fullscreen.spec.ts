import { expect, test } from "@playwright/test";

import { logIn } from "./helpers";

test("maximize fullscreens the app viewport; the floating button exits", async ({
  page,
}) => {
  await logIn(page);
  const viewport = page.locator("#app-viewport");

  await page.getByRole("button", { name: "Enter full screen" }).click();
  // data-fullscreen is the useFullscreen hook's state (set by the
  // fullscreenchange listener) - the primary assertion per M3's notes on
  // headless fullscreen quirks; the fullscreenElement check confirms the
  // right element when the API cooperates.
  await expect(viewport).toHaveAttribute("data-fullscreen", "true");
  expect(
    await page.evaluate(() => document.fullscreenElement?.id ?? null),
  ).toBe("app-viewport");

  // The header's toggle also reads "Exit full screen" now - use the floating
  // button inside the viewport (the header sits outside the fullscreened
  // element).
  await viewport.getByRole("button", { name: "Exit full screen" }).click();
  await expect(viewport).not.toHaveAttribute("data-fullscreen", "true");
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
});
