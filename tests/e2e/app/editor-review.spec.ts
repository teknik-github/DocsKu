import { ADMIN, createPage, expect, test, uid } from "../support/fixtures";

test.use({ storageState: ADMIN });

const saved = (page: import("@playwright/test").Page) => expect(page.locator("header").first()).toContainText("Tersimpan", { timeout: 60_000 });

test.describe("editor review panel", () => {
  test("internal notes: quote text, highlight it, reply, resolve; never on the public page", async ({ page, db, state }) => {
    const id = uid();
    const word = `kalimatuji${id}`;
    const pageId = await createPage(db, state, { slug: `catatan-${id}`, title: `Catatan ${id}`, body: `Angka ${word} perlu dicek lagi.` });
    await page.goto(`/admin/pages/${pageId}`);
    await saved(page);
    // Select the paragraph with the keyboard, then "Catatan internal" in the selection menu.
    await page.locator(".ProseMirror p", { hasText: word }).click();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await page.getByRole("button", { name: "Catatan internal" }).click();

    const panel = page.getByTestId("review-panel");
    await expect(panel.getByTestId("note-composer")).toContainText(word);
    await panel.getByTestId("note-composer").locator("textarea").fill(`Cek sumber angka ${id}`);
    await panel.getByRole("button", { name: "Simpan catatan" }).click();
    await expect(panel.locator("[data-note-card]")).toContainText(`Cek sumber angka ${id}`);
    await expect(page.locator(".ProseMirror .note-highlight")).toContainText(word);
    await expect(page.getByRole("button", { name: /Periksa/ })).toContainText("1");

    // Reply, then resolve: the highlight goes away and the note moves to "Selesai".
    await panel.getByRole("button", { name: "Balas" }).click();
    await panel.getByPlaceholder("Balas…").fill(`Sudah dicek ${id}`);
    await panel.getByRole("button", { name: "Balas", exact: true }).last().click();
    await expect(panel.locator("[data-note-card]")).toContainText(`Sudah dicek ${id}`);
    await panel.getByRole("button", { name: "Selesai", exact: true }).click();
    await expect(page.locator(".ProseMirror .note-highlight")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /Selesai \(1\)/ })).toBeVisible();
    const rows = await db`select parent_id, resolved_at from page_notes where page_id = ${pageId} order by created_at`;
    expect(rows).toHaveLength(2);
    expect(rows[0].resolved_at).not.toBeNull();

    // Notes are not part of the content.
    const [content] = await db`select draft_content::text as d, content::text as c from pages where id = ${pageId}`;
    expect(content.d).not.toContain("note");
    const html = await (await page.request.get(`/docs/catatan-${id}`)).text();
    expect(html).not.toContain(`Cek sumber angka ${id}`);
  });

  test("quality checks list problems, jump to them, and publishing asks first", async ({ page, db, state }) => {
    const id = uid();
    const pageId = await createPage(db, state, { slug: `kualitas-${id}`, title: `Kualitas ${id}`, status: "draft" });
    // A heading that skips a level and an image without alt text.
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Paragraf pembuka." }] },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: `Lompat ${id}` }] },
        { type: "image", attrs: { src: "/media/tidak-ada.png", alt: "" } },
      ],
    };
    await db`update pages set draft_content = ${JSON.stringify(content)}::jsonb, content = ${JSON.stringify(content)}::jsonb where id = ${pageId}`;
    await page.goto(`/admin/pages/${pageId}`);
    await page.getByRole("button", { name: /Periksa/ }).click();
    const tab = page.getByTestId("quality-tab");
    await expect(tab).toContainText("Deskripsi masih kosong.");
    await expect(tab).toContainText(`langsung memakai Judul 4`);
    await expect(tab).toContainText("Satu gambar belum punya teks alternatif.");

    // Publishing with open problems asks; "Periksa dulu" keeps it a draft.
    await page.getByRole("button", { name: "Terbitkan", exact: true }).click();
    await page.getByRole("button", { name: "Terbitkan sekarang" }).last().click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Terbitkan meski ada catatan?");
    await dialog.getByRole("button", { name: "Periksa dulu" }).click();
    await expect(page.getByTestId("quality-tab")).toBeVisible();
    expect((await db`select status::text as s from pages where id = ${pageId}`)[0].s).toBe("draft");

    // Fixing the description removes that problem live.
    await page.getByPlaceholder("Deskripsi singkat yang tampil di bawah judul").fill("Panduan uji yang menjelaskan cara memeriksa kualitas tulisan sebelum terbit.");
    await expect(tab).not.toContainText("Deskripsi masih kosong.");
    await saved(page);

    await page.getByRole("button", { name: "Terbitkan", exact: true }).click();
    await page.getByRole("button", { name: "Terbitkan sekarang" }).last().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Terbitkan saja" }).click();
    await expect.poll(async () => (await db`select status::text as s from pages where id = ${pageId}`)[0].s).toBe("published");
  });
});
