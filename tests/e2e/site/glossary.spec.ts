import { ADMIN, createPage, expect, test, uid } from "../support/fixtures";

test.describe("glossary", () => {
  test.use({ storageState: ADMIN });

  test("terms get a tooltip on their first use and a public A–Z page", async ({ page, db, state, browser }) => {
    const id = uid();
    const term = `Zetakontainer${id}`;
    await createPage(db, state, { slug: `glosarium-uji-${id}`, title: `Glosarium uji ${id}`, body: `Pakai ${term.toLowerCase()} untuk aplikasi. Lalu ${term} lagi.` });

    await page.goto("/admin/glossary");
    // No AI configured in the test server: suggestions are offered but disabled.
    await expect(page.getByRole("button", { name: "Usulkan dengan AI" })).toBeDisabled();
    await page.getByRole("button", { name: "Istilah baru" }).click();
    const form = page.getByTestId("glossary-form");
    await form.getByLabel("Istilah").fill(term);
    await form.getByLabel("Sebutan lain").fill(`zk${id}`);
    await form.getByLabel("Definisi").fill("Wadah ringan berisi aplikasi uji beserta kebutuhannya.");
    await form.getByRole("button", { name: "Tambah istilah" }).click();
    await expect(page.getByTestId("glossary-row").filter({ hasText: term })).toBeVisible();

    // A duplicate alias is refused.
    await page.getByRole("button", { name: "Istilah baru" }).click();
    await page.getByTestId("glossary-form").getByLabel("Istilah").fill(`zk${id}`);
    await page.getByTestId("glossary-form").getByLabel("Definisi").fill("Duplikat.");
    await page.getByTestId("glossary-form").getByRole("button", { name: "Tambah istilah" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "sudah dipakai" })).toBeVisible();
    await page.getByTestId("glossary-form").getByRole("button", { name: "Batal" }).click();

    // A visitor sees the first use marked, with the definition on hover.
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const reader = await visitor.newPage();
    await reader.goto(`/docs/glosarium-uji-${id}`);
    const marked = reader.locator("[data-glossary-term]");
    await expect(marked).toHaveCount(1);
    await marked.hover();
    await expect(reader.getByRole("tooltip")).toContainText("Wadah ringan berisi aplikasi uji");
    await reader.goto("/glosarium");
    await expect(reader.locator("[data-glossary-entry]", { hasText: term })).toContainText("Wadah ringan");
    await expect(reader.getByRole("contentinfo").getByRole("link", { name: "Glosarium" })).toBeVisible();

    // Tooltips off: no marks; deleting the last term makes /glosarium a 404.
    await page.getByLabel("Aktif").uncheck();
    await expect.poll(async () => (await db`select value->>'tooltips' as t from settings where key = 'glossary'`)[0]?.t).toBe("false");
    // The cache is refreshed right after the setting is written, so reload until it shows.
    await expect
      .poll(async () => {
        await reader.goto(`/docs/glosarium-uji-${id}`);
        return reader.locator("[data-glossary-term]").count();
      })
      .toBe(0);
    await page.getByRole("button", { name: `Hapus ${term}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click();
    await expect.poll(async () => (await reader.request.get("/glosarium")).status()).toBe(404);
    await db`delete from settings where key = 'glossary'`;
    await visitor.close();
  });
});
