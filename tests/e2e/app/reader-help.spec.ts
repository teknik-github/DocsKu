import { ADMIN, createPage, expect, refreshCache, test, uid } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

test.describe("helpful 404", () => {
  test("a mistyped docs address is a real 404 that suggests the page and offers a search", async ({ page }) => {
    const res = await page.goto("/docs/panduan/instalsi");
    expect(res?.status()).toBe(404);
    const similar = page.getByTestId("similar-pages");
    await expect(similar).toContainText(SEED_PAGES.install.title);
    await page.getByLabel("Cari di dokumentasi").fill("pengenalan");
    await expect(page.getByTestId("not-found-results")).toContainText(SEED_PAGES.intro.title);
  });
});

test.describe("section feedback", () => {
  test("a reader marks a passage as confusing; the team sees it as a note", async ({ page, db, state, browser }) => {
    const id = uid();
    const passage = `Kalimat yang membingungkan ${id} di sini.`;
    const pageId = await createPage(db, state, { slug: `bingung-${id}`, title: `Bingung ${id}`, body: passage });
    await page.goto(`/docs/bingung-${id}`);
    const paragraph = page.locator('[class*="prose-"] p', { hasText: id });
    await expect(async () => {
      await paragraph.click({ clickCount: 3 });
      await expect(page.getByRole("button", { name: "Bagian ini membingungkan?" })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await page.getByRole("button", { name: "Bagian ini membingungkan?" }).click();
    await page.getByLabel("Apa yang membingungkan? (opsional)").fill(`Istilahnya tidak dijelaskan ${id}`);
    await page.getByRole("button", { name: "Kirim ke tim" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Terima kasih" })).toBeVisible();
    await expect
      .poll(async () => (await db`select source, quote, body, author_id from page_notes where page_id = ${pageId} and parent_id is null`).map((row) => [row.source, row.body, row.author_id]))
      .toEqual([["reader", `Istilahnya tidak dijelaskan ${id}`, null]]);
    const [note] = await db`select quote from page_notes where page_id = ${pageId}`;
    expect(note.quote).toContain(`membingungkan ${id}`);

    // The same passage again: a reply on the open note, not a second note.
    const again = await page.request.post("/api/section-feedback", { data: { slug: `bingung-${id}`, quote: note.quote, message: "" } });
    expect(again.status()).toBe(200);
    const rows = await db`select parent_id, body from page_notes where page_id = ${pageId} order by created_at`;
    expect(rows).toHaveLength(2);
    expect(rows[1].parent_id).not.toBeNull();
    expect(rows[1].body).toBe("Pembaca lain juga menandai bagian ini.");

    // The editor shows it as "Pembaca · dari situs", highlighted in the text.
    const team = await browser.newContext({ storageState: ADMIN });
    const editor = await team.newPage();
    await editor.goto(`/admin/pages/${pageId}`);
    await expect(editor.getByRole("button", { name: /Periksa/ })).toContainText("1");
    await editor.getByRole("button", { name: /Periksa/ }).click();
    await editor.getByRole("tab", { name: /Catatan/ }).click();
    await expect(editor.locator("[data-note-card]")).toContainText("dari situs");
    await expect(editor.locator(".ProseMirror .note-highlight")).toContainText(id);
    await team.close();

    // Switched off: the endpoint refuses.
    await db`insert into settings (key, value) values ('comments', '{"enabled":true,"moderation":false,"sectionFeedback":false}'::jsonb) on conflict (key) do update set value = excluded.value`;
    await refreshCache(state);
    try {
      const off = await page.request.post("/api/section-feedback", { data: { slug: `bingung-${id}`, quote: "apa saja yang panjang", message: "" } });
      expect(off.status()).toBe(403);
    } finally {
      await db`delete from settings where key = 'comments'`;
      await refreshCache(state);
    }
  });
});

test.describe("link preview in the editor", () => {
  test.use({ storageState: ADMIN });

  test("the cursor in a link shows its target page and state, or that it is missing", async ({ page, db, state }) => {
    const id = uid();
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: `Baca pengenalan${id}`, marks: [{ type: "link", attrs: { href: "/docs/pengenalan" } }] }] },
        { type: "paragraph", content: [{ type: "text", text: `Tautan hilang${id}`, marks: [{ type: "link", attrs: { href: "/docs/tidak-ada-sama-sekali" } }] }] },
        { type: "paragraph", content: [{ type: "text", text: `Rahasia${id}`, marks: [{ type: "link", attrs: { href: "/docs/tim/rahasia" } }] }] },
      ],
    };
    const pageId = await createPage(db, state, { slug: `tautan-${id}`, title: `Tautan ${id}`, status: "draft" });
    await db`update pages set draft_content = ${JSON.stringify(content)}::jsonb where id = ${pageId}`;
    await page.goto(`/admin/pages/${pageId}`);
    await expect(page.locator("header").first()).toContainText("Tersimpan", { timeout: 60_000 });
    const preview = page.getByTestId("link-preview");

    await page.locator(".ProseMirror a", { hasText: `pengenalan${id}` }).click();
    await expect(preview.getByTestId("link-info")).toContainText(SEED_PAGES.intro.title);
    await expect(preview.getByTestId("link-info")).toContainText("Terbit");

    await page.locator(".ProseMirror a", { hasText: `hilang${id}` }).click();
    await expect(preview.getByTestId("link-info")).toContainText("Halaman ini tidak ada.");

    await page.locator(".ProseMirror a", { hasText: `Rahasia${id}` }).click();
    await expect(preview.getByTestId("link-info")).toContainText("Hanya tim yang bisa membukanya.");
  });
});
