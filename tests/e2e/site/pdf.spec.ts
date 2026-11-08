import { ADMIN, createPage, expect, test, uid } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

/** The PDF's Info dictionary (title, producer) is stored uncompressed, so it can be read from the bytes. */
const pdfText = (body: Buffer) => body.toString("latin1");

test.describe("PDF downloads", () => {
  test("an article downloads as a PDF; drafts, unknown and internal pages are 404 for visitors", async ({ request, db, state }) => {
    const res = await request.get(`/pdf/docs/${SEED_PAGES.intro.slug}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect(res.headers()["content-disposition"]).toContain('attachment; filename="pengenalan.pdf"');
    expect(res.headers()["x-robots-tag"]).toBe("noindex");
    const body = await res.body();
    expect(pdfText(body).startsWith("%PDF-")).toBe(true);
    expect(pdfText(body)).toContain("Pengenalan");

    const id = uid();
    const draft = `draf-pdf-${id}`;
    await createPage(db, state, { slug: draft, title: `Draf PDF ${id}`, status: "draft" });
    expect((await request.get(`/pdf/docs/${draft}`)).status()).toBe(404);
    expect((await request.get(`/pdf/docs/tidak-ada-${id}`)).status()).toBe(404);
    expect((await request.get(`/pdf/docs/${SEED_PAGES.internal.slug}`)).status()).toBe(404);
  });

  test("a category downloads with every page; an unknown category is 404", async ({ request }) => {
    const res = await request.get("/pdf/kategori/sec-lanjutan");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toContain('filename="lanjutan.pdf"');
    expect(pdfText(await res.body())).toContain("Lanjutan");
    expect((await request.get("/pdf/kategori/tidak-ada")).status()).toBe(404);
  });

  test.describe("signed in", () => {
    test.use({ storageState: ADMIN });

    test("the team can download an internal article, never cached publicly", async ({ page }) => {
      const res = await page.request.get(`/pdf/docs/${SEED_PAGES.internal.slug}`);
      expect(res.status()).toBe(200);
      expect(res.headers()["cache-control"]).toBe("private, no-store");
    });

    test("the article shows Unduh PDF; switching PDFs off hides it and closes the route", async ({ page, request }) => {
      await page.goto(`/docs/${SEED_PAGES.intro.slug}`);
      const button = page.getByRole("link", { name: "Unduh PDF", exact: true });
      await expect(button).toHaveAttribute("href", `/pdf/docs/${SEED_PAGES.intro.slug}`);

      await page.goto("/admin/theme");
      const toggle = page.getByRole("switch", { name: "Unduh PDF" });
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await expect.poll(async () => (await request.get(`/pdf/docs/${SEED_PAGES.intro.slug}`)).status()).toBe(404);
      await page.goto(`/docs/${SEED_PAGES.intro.slug}`);
      await expect(page.getByRole("button", { name: "Salin halaman" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Unduh PDF", exact: true })).toHaveCount(0);

      await page.goto("/admin/theme");
      await page.getByRole("switch", { name: "Unduh PDF" }).click();
      await expect(page.getByRole("switch", { name: "Unduh PDF" })).toHaveAttribute("aria-checked", "true");
      await expect.poll(async () => (await request.get(`/pdf/docs/${SEED_PAGES.intro.slug}`)).status()).toBe(200);
    });
  });
});
