import { expect, overflow, refreshCache, test } from "./support/fixtures";
import { SEED_PAGES } from "./support/seed";
import { readState } from "./support/env";

const LAYOUTS = ["docs", "hybrid", "ghost", "helpcenter", "book", "minimal", "wiki", "magazine", "developer"];

test.describe.configure({ mode: "serial" });

for (const layout of LAYOUTS) {
  test(`layout "${layout}": hub and article render, with the author and no overflow on a phone`, async ({ page, db, state }) => {
    await db`update settings set value = jsonb_set(value, '{layout}', ${JSON.stringify(layout)}::jsonb) where key = 'site'`;
    await refreshCache(state);

    expect((await page.goto("/docs"))?.status()).toBe(200);
    await expect(page.getByText(SEED_PAGES.intro.title).first()).toBeVisible();
    const res = await page.goto(`/docs/${SEED_PAGES.install.slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: SEED_PAGES.install.title })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Persyaratan" })).toBeVisible();
    await expect(page.getByText("Admin Uji").first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await page.goto("/docs");
    await page.waitForLoadState("networkidle");
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
}

test.afterAll(async ({ db }) => {
  await db`update settings set value = jsonb_set(value, '{layout}', '"docs"'::jsonb) where key = 'site'`;
  await refreshCache(readState());
});
