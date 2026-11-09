import { ADMIN, expect, test } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

test.describe("smarter search", () => {
  test("typos, synonyms, category filter, and the search → article click is counted", async ({ page, db }) => {
    await page.goto("/docs/pengenalan");
    // Let the sidebar's prefetches finish: navigating while they stream aborts them, and React logs that as an error.
    await page.waitForLoadState("networkidle");
    const dialog = page.getByRole("dialog");
    // Ctrl+K works once the page is hydrated; retry until the dialog opens.
    await expect(async () => {
      await page.keyboard.press("Control+K");
      await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    const input = dialog.getByRole("textbox");

    // A typo still finds the page and offers the spelling.
    await input.fill("instalsi");
    await expect(dialog.getByRole("button", { name: /Instalasi/ }).first()).toBeVisible();
    await expect(dialog.getByTestId("search-suggestion")).toHaveText("Mungkin maksud Anda “instalasi”");

    // A synonym ("install") finds "Instalasi".
    await input.fill("install");
    await expect(dialog.getByRole("button", { name: /Instalasi/ }).first()).toBeVisible();
    await expect(dialog.getByTestId("search-suggestion")).toHaveCount(0);

    // Results from two categories get filter chips.
    await input.fill("panduan");
    const chips = dialog.getByTestId("search-categories");
    await expect(chips.getByRole("button", { name: "Lanjutan" })).toBeVisible();
    await chips.getByRole("button", { name: "Lanjutan" }).click();
    await expect(dialog.getByRole("button", { name: /Pengenalan/ })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /Instalasi/ }).first()).toBeVisible();

    await input.fill("install");
    await dialog.getByRole("button", { name: /Instalasi/ }).first().click();
    await page.waitForURL(`**/docs/${SEED_PAGES.install.slug}`);
    await expect
      .poll(async () => (await db`select coalesce(sum(c.clicks), 0)::int as n from search_clicks c join pages p on p.id = c.page_id where c.query = 'install' and p.slug = ${SEED_PAGES.install.slug}`)[0].n)
      .toBeGreaterThan(0);
  });
});

test.describe("reading analytics", () => {
  test("a finished visit records depth, time and exit; the dashboard shows it", async ({ db, browser }) => {
    // "Panduan lama": no other test reads it, so the counts are this test's own.
    const slug = SEED_PAGES.old.slug;
    const totals = async () =>
      (
        await db`select coalesce(sum(r.reads), 0)::int as reads, coalesce(sum(r.exits), 0)::int as exits, coalesce(sum(r.depth_100), 0)::int as done
          from page_reads r join pages p on p.id = r.page_id where p.slug = ${slug}`
      )[0];
    const before = await totals();
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reader = await visitor.newPage();
    await reader.goto(`/docs/${slug}`);
    await reader.mouse.wheel(0, 5000);
    await reader.waitForTimeout(1500);
    // Closing the tab leaves the site from this page: pagehide sends the read with exit = true.
    // (Headless Chromium drops beacons sent while navigating to another site, so the test closes the tab.)
    await reader.close({ runBeforeUnload: true });
    await expect.poll(totals).toMatchObject({ reads: before.reads + 1, exits: before.exits + 1, done: before.done + 1 });
    await visitor.close();

    const admin = await browser.newContext({ storageState: ADMIN });
    const dashboard = await admin.newPage();
    await dashboard.goto("/admin/stats");
    await expect(dashboard.getByTestId("engagement")).toContainText(SEED_PAGES.old.title);
    await expect(dashboard.getByTestId("search-flow")).toBeVisible();
    await admin.close();
  });
});
