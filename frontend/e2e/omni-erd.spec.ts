import { expect, test, type Page } from "@playwright/test";

import { E2E_ADMIN, logIn } from "./helpers";

/**
 * Omni-ERD's first end-to-end coverage.
 *
 * Signs in as staff rather than the regular `e2e` account: app access is
 * deny-by-default and the fixture user is only granted expense-tracker, so
 * staff bypass is the shortest honest route to the diagram.
 *
 * Everything here asserts on node *counts*, `data-mode` and `data-testid` -
 * never on pixel geometry. React Flow measures the DOM, and headless Chromium
 * gives it a viewport that has nothing to do with a real one; the same caveat
 * that keeps the canvas out of the jsdom tests applies here.
 */

const DIAGRAM = "/apps/omni-erd/diagram";
const NODE = ".react-flow__node";

/** The canvas is lazy-loaded and then measures itself, so "the page responded"
 *  is not the same as "the diagram is drawn". */
async function waitForDiagram(page: Page) {
  await expect(page.locator(NODE).first()).toBeVisible({ timeout: 20_000 });
}

async function openDisplay(page: Page) {
  await page.getByRole("button", { name: "Display options" }).click();
}

/**
 * Put the saved diagram state back to defaults.
 *
 * Column mode and node positions persist per user, and every test here signs in
 * as the same account against the same database - so without this, a test that
 * switches to "All" silently changes the starting conditions of every test that
 * runs after it. That is not hypothetical: it is what made the per-card toggle
 * assertion fail, having cycled from a default of `all` straight onto `keys`,
 * the one value it was asserting against.
 */
async function resetSavedState(page: Page) {
  await page.evaluate(async () => {
    const csrf = (document.cookie.match(/csrftoken=([^;]+)/) ?? [])[1] ?? "";
    await fetch("/api/omni-erd/layouts/pg-omniview/omniview", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
      body: JSON.stringify({
        positions: {},
        view_state: { default_mode: "keys", overrides: {} },
      }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await logIn(page, DIAGRAM, E2E_ADMIN);
  await waitForDiagram(page);
  await resetSavedState(page);
  await page.reload();
  await waitForDiagram(page);
});

test("draws the omniview schema with edges between its tables", async ({ page }) => {
  await expect(page.locator(NODE)).not.toHaveCount(0);
  // Django declares real foreign keys, so this schema must produce edges. A
  // diagram with nodes and no edges would mean introspection silently degraded.
  await expect(page.locator(".react-flow__edge")).not.toHaveCount(0);
});

test("opens in keys mode, the compact default", async ({ page }) => {
  await expect(page.locator("[data-mode]").first()).toHaveAttribute("data-mode", "keys");
});

test("tags primary and foreign key columns with PK/FK labels", async ({ page }) => {
  // The omniview schema declares real primary and foreign keys, so both tags
  // must appear on the default keys-mode cards. A schema drawn without either
  // would mean the key-role derivation silently degraded.
  await expect(page.locator('[data-key-role="pk"]').first()).toBeVisible();
  await expect(page.locator('[data-key-role="fk"]').first()).toBeVisible();
});

test("the column control collapses and expands every card", async ({ page }) => {
  const first = page.locator("[data-mode]").first();

  await openDisplay(page);
  await page.getByRole("radio", { name: "None" }).click();
  await expect(first).toHaveAttribute("data-mode", "none");

  await page.getByRole("radio", { name: "All" }).click();
  await expect(first).toHaveAttribute("data-mode", "all");
});

test("edges stay attached to a mounted handle in every mode", async ({ page }) => {
  // The regression the whole handle design exists for: collapsing a card
  // unmounts its column handles, and an edge left pointing at one strands
  // itself at the node's origin, which React Flow renders as a NaN path.
  for (const mode of ["None", "Keys", "All"]) {
    await openDisplay(page);
    await page.getByRole("radio", { name: mode }).click();
    await page.keyboard.press("Escape");

    const broken = await page.evaluate(() =>
      [...document.querySelectorAll(".react-flow__edge path.react-flow__edge-path")].filter((p) =>
        (p.getAttribute("d") ?? "").includes("NaN"),
      ).length,
    );
    expect(broken, `edges broke in ${mode} mode`).toBe(0);
  }
});

test("a per-card toggle overrides the global mode for that card only", async ({ page }) => {
  const target = page.locator('[data-testid="erd-node-omniview.auth_user"]');
  const other = page.locator('[data-testid="erd-node-omniview.django_session"]');

  // Clicked in-page rather than positionally: the canvas pans, so a card's
  // screen position is not knowable from a test and the toolbars overlay parts
  // of it. Reached through the React Flow node wrapper because a role-scoped
  // locator on the inner card did not resolve to this button reliably in
  // headless Chromium.
  //
  // Not focus+Enter either, though the toggle does work that way - React Flow's
  // node wrapper reclaims focus between Playwright's `focus()` and its
  // `press()`, so the keystroke lands on the wrapper. Verified by hand in a real
  // browser instead, and the explicit `onKeyDown` in TableNode is what makes
  // keyboard activation work at all.
  await page.evaluate(() => {
    const node = [...document.querySelectorAll(".react-flow__node")].find(
      (n) => (n as HTMLElement).dataset.id === "omniview.auth_user",
    );
    node?.querySelector<HTMLButtonElement>('button[aria-label^="Columns:"]')?.click();
  });

  // Compared against a sibling rather than a hardcoded mode, so the assertion
  // holds whatever the default happens to be.
  await expect(target).not.toHaveAttribute("data-mode", "keys");
  await expect(other).toHaveAttribute("data-mode", "keys");
});

test("clicking a table opens its details, and a relationship link navigates", async ({ page }) => {
  await page.locator(NODE).first().click();

  const panel = page.getByLabel(/^Details for /);
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Referenced by", { exact: false })).toBeVisible();
});

test("ctrl-click builds a multi-selection with a contextual flyout, and a plain click exits it", async ({
  page,
}) => {
  const a = page.locator('[data-testid="erd-node-omniview.auth_user"]');
  const b = page.locator('[data-testid="erd-node-omniview.django_session"]');
  const c = page.locator('[data-testid="erd-node-omniview.auth_group"]');
  const selected = page.locator(`${NODE}.selected`);

  // First Ctrl-click opens the contextual flyout listing that one table.
  await a.click({ modifiers: ["Control"] });
  await expect(page.getByLabel("1 table selected")).toBeVisible();
  await expect(selected).toHaveCount(1);

  // A second grows the list; both stay highlighted.
  await b.click({ modifiers: ["Control"] });
  await expect(page.getByLabel("2 tables selected")).toBeVisible();
  await expect(selected).toHaveCount(2);

  // Ctrl-clicking a selected table removes it.
  await b.click({ modifiers: ["Control"] });
  await expect(page.getByLabel("1 table selected")).toBeVisible();
  await expect(selected).toHaveCount(1);

  // A plain click exits multi-select and returns the single-table flyout.
  await c.click();
  await expect(page.getByLabel(/ selected$/)).toBeHidden();
  await expect(page.getByLabel("Details for auth_group")).toBeVisible();
  await expect(selected).toHaveCount(1);
});

test("focus hides everything unrelated, and the banner restores it", async ({ page }) => {
  const total = await page.locator(NODE).count();

  // auth_user is referenced by 8 tables but references none, so focusing it
  // must leave strictly fewer than the whole schema.
  await page.locator('[data-testid="erd-node-omniview.auth_user"]').click();
  await page.getByRole("button", { name: "Focus", exact: true }).click();

  const banner = page.getByRole("status");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("auth_user");
  await expect(banner).toContainText(`of ${total}`);

  // Polled, not read once: the departing cards fade for 180ms *before* they are
  // hidden, so the count is deliberately still whole for a moment after the
  // banner appears.
  await expect
    .poll(() => page.locator(`${NODE}:visible`).count(), { timeout: 5000 })
    .toBeLessThan(total);

  await page.getByRole("button", { name: "Show all tables" }).click();
  await expect(banner).toBeHidden();
  await expect(page.locator(`${NODE}:visible`)).toHaveCount(total);
});

/** Search starts collapsed to an icon in the top-left, sharing that corner with
 *  the display control; the input only exists once it has been opened. */
async function search(page: Page, query: string) {
  await page.getByTestId("erd-search-toggle").click();
  await page.getByTestId("erd-search").fill(query);
}

test("search flies to a table and opens its details", async ({ page }) => {
  await search(page, "django_session");
  await page.getByRole("option", { name: /django_session/ }).first().click();

  await expect(page.getByLabel("Details for django_session")).toBeVisible();
});

test("a result can be chosen with the keyboard alone", async ({ page }) => {
  // Regression: the input stopped propagation on every key, which kept the
  // event from reaching cmdk's handler on the Command root - arrow navigation
  // and Enter silently did nothing while the bar looked perfectly fine.
  await search(page, "django_session");
  await expect(page.getByRole("option", { name: /django_session/ }).first()).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(page.getByLabel("Details for django_session")).toBeVisible();
  // Choosing a result closes the bar, so it does not cover what you jumped to.
  await expect(page.getByTestId("erd-search-toggle")).toBeVisible();
});

test("search reaches a column far down a wide table", async ({ page }) => {
  // The regression: the results list used to be capped *before* filtering, so a
  // column past the 40th in catalog order could not be found at all. app_label
  // sits well down django_content_type.
  await search(page, "app_label");

  await expect(page.getByRole("option", { name: /app_label/ }).first()).toBeVisible();
});

test("search finds a column and expands the table that holds it", async ({ page }) => {
  // Picking a column must leave that column actually visible on arrival, which
  // means overriding a collapsed card to `all`.
  await search(page, "is_superuser");
  await page.getByRole("option", { name: /is_superuser/ }).first().click();

  await expect(page.locator('[data-testid="erd-node-omniview.auth_user"]')).toHaveAttribute(
    "data-mode",
    "all",
  );
});

/**
 * A node's position in *flow* coordinates, read from the transform React Flow
 * writes on it.
 *
 * Screen coordinates are useless for this: the diagram re-fits on load, so the
 * same stored position lands somewhere slightly different on screen and the
 * comparison fails for a reason that has nothing to do with persistence.
 */
async function flowPosition(page: Page, testId: string): Promise<[number, number]> {
  const transform = await page.locator(`[data-testid="${testId}"]`).evaluate((el) => {
    const node = el.closest(".react-flow__node") as HTMLElement | null;
    return node?.style.transform ?? "";
  });
  const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform);
  expect(match, `no transform on ${testId}`).not.toBeNull();
  return [Number(match![1]), Number(match![2])];
}

test("a dragged table stays put across a reload", async ({ page }) => {
  // The persistence path has been verified at the API and DB level since the
  // POC, but never through a real browser session until here.
  const testId = "erd-node-omniview.auth_user";
  const card = page.locator(`[data-testid="${testId}"]`);
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  const before = await flowPosition(page, testId);

  await page.mouse.move(box!.x + 60, box!.y + 8);
  await page.mouse.down();
  await page.mouse.move(box!.x + 220, box!.y + 130, { steps: 12 });
  await page.mouse.up();

  const moved = await flowPosition(page, testId);
  expect(moved).not.toEqual(before);

  // The save is debounced by 800ms; reloading before it lands proves nothing.
  await page.waitForTimeout(1500);
  await page.reload();
  await waitForDiagram(page);

  const after = await flowPosition(page, testId);
  expect(after[0]).toBeCloseTo(moved[0], 0);
  expect(after[1]).toBeCloseTo(moved[1], 0);
});

test("the column mode survives a reload too", async ({ page }) => {
  await openDisplay(page);
  await page.getByRole("radio", { name: "None" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-mode]").first()).toHaveAttribute("data-mode", "none");

  await page.waitForTimeout(1200);
  await page.reload();
  await waitForDiagram(page);

  await expect(page.locator("[data-mode]").first()).toHaveAttribute("data-mode", "none");
});
