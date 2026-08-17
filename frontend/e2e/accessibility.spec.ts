import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

import { E2E_ADMIN, logIn } from "./helpers";

/**
 * WCAG violations, counted.
 *
 * Visual design is a matter of taste and cannot be gated; conformance to a
 * published rule set is a count, and axe produces it.
 *
 * Scope is `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`. The "best-practice" tag is
 * deliberately excluded - those are opinions with a rule id, which is what this
 * measurement programme exists to avoid.
 *
 * Each page asserts the **exact set of rule ids** measured when the check was
 * introduced, not a count and not zero. An exact set fails in both directions:
 * a new violation fails, and so does a fixed one, which forces the baseline down
 * instead of letting it rot upward. Removing an id is the only edit that should
 * ever be needed here.
 *
 * Remaining violations and who owns them:
 *
 * - `aria-required-children` on the tab bar is **ours**. `role="tablist"` wraps
 *   each tab in a div carrying the drag handlers, so the list owns divs rather
 *   than tabs - and the wrapper also holds the close button, so marking it
 *   presentational just promotes a `button` into the tablist instead. It needs a
 *   structural change to the tab bar, not an attribute.
 * - `aria-allowed-attr` / `aria-roles` / `aria-valid-attr` / the second
 *   `aria-required-children` on the check book are **Tabulator's** generated
 *   markup (`div[aria-title=…]`, `.tabulator`). Not fixable from here. They come
 *   specifically from its *grouped* column headers - the Breakdown matrix runs
 *   the same grid with flat columns and carries none of them.
 * - `color-contrast` on the Omni-ERD diagram is the column type/badge palette on
 *   the table cards.
 *
 * Already fixed by this check: the avatar fallback rendered muted-on-muted, which
 * failed contrast on every authenticated page.
 */

const STANDARD = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function violatedRules(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(STANDARD).analyze();
  return violations.map((v) => v.id).sort();
}

test("the login page is clean", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  expect(await violatedRules(page)).toEqual([]);
});

test("the launcher is clean", async ({ page }) => {
  await logIn(page);

  expect(await violatedRules(page)).toEqual([]);
});

test("the check book carries only the known tab-bar and Tabulator violations", async ({ page }) => {
  await logIn(page, "/apps/expense-tracker/check-book");
  // The grid arrives by dynamic import; scanning earlier would measure an empty page.
  await expect(page.locator(".tabulator").first()).toBeVisible();

  expect(await violatedRules(page)).toEqual([
    "aria-allowed-attr",
    "aria-required-children",
    "aria-roles",
    "aria-valid-attr",
  ]);
});

test("the breakdown report carries only the known tab-bar violation", async ({ page }) => {
  await logIn(page, "/apps/expense-tracker/breakdown");
  // Both the grid and the charts arrive by dynamic import; scanning earlier
  // would measure a page that has not drawn its visuals yet.
  await expect(page.locator(".tabulator").first()).toBeVisible();
  await expect(page.getByRole("img", { name: "Expenses by Category" })).toBeVisible();

  // Notably *not* the three Tabulator rules the check book carries: those come
  // from its grouped column headers, and this matrix's columns are flat. Two
  // Recharts charts add nothing, because each is a labelled `img`.
  expect(await violatedRules(page)).toEqual(["aria-required-children"]);
});

test("the admin user table carries only the known tab-bar violation", async ({ page }) => {
  await logIn(page, "/apps/admin-portal/users", E2E_ADMIN);
  await expect(page.getByRole("table")).toBeVisible();

  expect(await violatedRules(page)).toEqual(["aria-required-children"]);
});
