import { ADMIN, expect, refreshCache, test } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

test.use({ storageState: ADMIN });
test.describe.configure({ mode: "serial" });

test.describe("multi-language docs", () => {
  test("enable English, translate a page, publish it: English chrome, hreflang, navigation untouched", async ({ page, db, state, browser }) => {
    await page.goto("/admin/settings#bahasa");
    const section = page.locator("#bahasa");
    await section.getByRole("button", { name: "+ English" }).click();
    await section.getByRole("button", { name: "Simpan" }).click();
    await expect.poll(async () => (await db`select value from settings where key = 'languages'`)[0]?.value?.languages?.[0]?.code).toBe("en");

    const [{ value: navigationBefore }] = await db`select value from settings where key = 'navigation'`;
    const [original] = await db`select id from pages where slug = ${SEED_PAGES.intro.slug}`;
    await page.goto(`/admin/pages/${original.id}`);
    await page.getByRole("button", { name: "Pengaturan halaman" }).click();
    await page.getByTestId("translation-section").getByRole("button", { name: "Buat terjemahan" }).click();
    await expect.poll(async () => (await db`select count(*)::int as n from pages where translation_of = ${original.id} and locale = 'en'`)[0].n).toBe(1);
    const [translation] = await db`select id, slug from pages where translation_of = ${original.id} and locale = 'en'`;
    expect(translation.slug).toBe(`en/${SEED_PAGES.intro.slug}`);

    await page.goto(`/admin/pages/${translation.id}`);
    await page.getByPlaceholder("Judul halaman").fill("Introduction");
    await page.getByRole("button", { name: "Terbitkan", exact: true }).click();
    await page.getByRole("button", { name: "Terbitkan sekarang" }).last().click();
    await expect.poll(async () => (await db`select status from pages where id = ${translation.id}`)[0].status, { timeout: 30_000 }).toBe("published");
    // A translation never enters the navigation; it inherits the original's place.
    const [{ value: navigationAfter }] = await db`select value from settings where key = 'navigation'`;
    expect(navigationAfter).toEqual(navigationBefore);

    const visitor = await browser.newContext();
    const reader = await visitor.newPage();
    const res = await reader.goto(`/docs/en/${SEED_PAGES.intro.slug}`);
    expect(res?.status()).toBe(200);
    await expect(reader.getByRole("heading", { level: 1, name: "Introduction" })).toBeVisible();
    await expect(reader.locator('[lang="en"]').first()).toBeAttached();
    await expect(reader.getByText("Was this page helpful?")).toBeVisible();

    await reader.goto(`/docs/${SEED_PAGES.intro.slug}`);
    await expect(reader.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute("href", new RegExp(`/docs/en/${SEED_PAGES.intro.slug}$`));
    await expect(reader.getByText("Apakah halaman ini membantu?")).toBeVisible();

    // The language hub and the language home (no English home yet: it redirects to the hub).
    expect((await reader.goto("/docs/en"))?.status()).toBe(200);
    await reader.goto("/en");
    await expect(reader).toHaveURL(/\/docs\/en$/);
    expect((await reader.request.get("/fr")).status()).toBe(404);
    const sitemap = await (await reader.request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(`/docs/en/${SEED_PAGES.intro.slug}`);
    await visitor.close();

    // Switch the language off again for the specs that follow.
    await db`delete from settings where key = 'languages'`;
    await refreshCache(state);
  });
});
