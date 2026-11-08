import { ADMIN, createPage, expect, refreshCache, test, uid } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

test.describe("documentation versions", () => {
  test.use({ storageState: ADMIN });

  test("archive the docs, keep reading the old version while the live docs change", async ({ page, db, state, browser }) => {
    const id = uid();
    const linker = await createPage(db, state, { slug: `tautan-versi-${id}`, title: `Tautan versi ${id}` });
    const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Mulai dari pengenalan", marks: [{ type: "link", attrs: { href: "/docs/pengenalan#bagian" } }] }] }] };
    await db`update pages set content = ${JSON.stringify(content)}::jsonb where id = ${linker}`;
    await refreshCache(state);

    await page.goto("/admin/versions");
    await page.getByLabel("Nama versi saat ini").fill("v2");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText("Nama versi saat ini disimpan.")).toBeVisible();
    const form = page.getByTestId("archive-form");
    await form.getByLabel("Nama versi").fill(`v1 ${id}`);
    await form.getByLabel("Alamat").fill(`1-${id}`);
    await form.getByRole("button", { name: "Arsipkan sekarang" }).click();
    await expect(page.getByText(`Dokumentasi diarsipkan sebagai v1 ${id}.`)).toBeVisible();
    await expect(page.getByTestId("version-row").filter({ hasText: `v1 ${id}` })).toBeVisible();

    // The live docs change; the archive doesn't.
    const [intro] = await db`select id, title from pages where slug = ${SEED_PAGES.intro.slug}`;
    await db`update pages set title = ${`Pengenalan baru ${id}`} where id = ${intro.id}`;
    await refreshCache(state);
    try {
      const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const reader = await visitor.newPage();
      await reader.goto(`/docs/v/1-${id}`);
      await expect(reader.getByTestId("version-hub")).toContainText(SEED_PAGES.intro.title);
      await reader.goto(`/docs/v/1-${id}/${SEED_PAGES.intro.slug}`);
      await expect(reader.getByRole("heading", { level: 1 })).toHaveText(SEED_PAGES.intro.title);
      await expect(reader.getByTestId("version-banner")).toContainText(`v1 ${id}`);
      await expect(reader.getByTestId("version-banner").getByRole("link")).toHaveAttribute("href", `/docs/${SEED_PAGES.intro.slug}`);
      await expect(reader.getByTestId("version-menu")).toHaveText(`v1 ${id}`);
      await expect(reader.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      // The sidebar and links inside archived pages stay in the version.
      await expect(reader.locator(`aside a[href="/docs/v/1-${id}/${SEED_PAGES.install.slug}"]`).first()).toBeAttached();
      await reader.goto(`/docs/v/1-${id}/tautan-versi-${id}`);
      await expect(reader.getByRole("link", { name: "Mulai dari pengenalan" })).toHaveAttribute("href", `/docs/v/1-${id}/pengenalan#bagian`);

      // The live docs show the new title and offer the version picker.
      await reader.goto(`/docs/${SEED_PAGES.intro.slug}`);
      await expect(reader.getByRole("heading", { level: 1 })).toHaveText(`Pengenalan baru ${id}`);
      await reader.getByTestId("version-menu").click();
      await expect(reader.getByRole("link", { name: `v1 ${id}` })).toHaveAttribute("href", `/docs/v/1-${id}`);

      // Unknown versions and pages are real 404s.
      expect((await reader.request.get(`/docs/v/1-${id}/tidak-ada`)).status()).toBe(404);
      expect((await reader.request.get("/docs/v/tidak-ada-versi")).status()).toBe(404);
      await visitor.close();
    } finally {
      await db`update pages set title = ${intro.title} where id = ${intro.id}`;
      await page.goto("/admin/versions");
      await page.getByRole("button", { name: `Hapus v1 ${id}` }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Hapus versi" }).click();
      await expect(page.getByTestId("version-row")).toHaveCount(0);
      await db`delete from settings where key = 'versions'`;
      await refreshCache(state);
    }
    expect((await page.request.get(`/docs/v/1-${id}`)).status()).toBe(404);
  });
});
