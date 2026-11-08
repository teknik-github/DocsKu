import { ADMIN, EDITOR, createPage, expect, test, uid } from "../support/fixtures";

test.describe("pages", () => {
  test.use({ storageState: ADMIN });

  test("create from a template, publish, read publicly, unpublish → 404", async ({ page, db, browser }) => {
    const id = uid();
    const title = `Pertanyaan umum ${id}`;
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: /Halaman baru/ }).first().click();
    const picker = page.getByRole("dialog", { name: /Halaman baru|templat/i });
    await picker.getByRole("radio", { name: /FAQ/ }).click();
    await picker.getByRole("button", { name: "Buat halaman" }).click();
    await page.waitForURL(/\/admin\/pages\/[0-9a-f-]{36}/);
    const pageId = page.url().split("/").pop()!.split("?")[0];
    // The template filled the working copy with FAQ blocks.
    await expect(page.locator(".ProseMirror h2").first()).toBeVisible();

    const titleBox = page.getByPlaceholder("Judul halaman");
    await titleBox.fill(title);
    await page.getByRole("button", { name: "Terbitkan", exact: true }).click();
    await page.getByRole("button", { name: "Terbitkan sekarang" }).last().click();
    await expect.poll(async () => (await db`select status from pages where id = ${pageId}`)[0].status, { timeout: 30_000 }).toBe("published");
    const [{ slug }] = await db`select slug from pages where id = ${pageId}`;
    expect(slug).not.toMatch(/^tanpa-judul/);

    const visitor = await browser.newContext();
    const reader = await visitor.newPage();
    const ok = await reader.goto(`/docs/${slug}`);
    expect(ok?.status()).toBe(200);
    await expect(reader.getByRole("heading", { level: 1, name: title })).toBeVisible();

    // Take it off the site again.
    await page.getByRole("button", { name: /^Terbit/ }).first().click();
    await page.getByRole("button", { name: "Batalkan terbit" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Tarik dari situs" }).click();
    await expect.poll(async () => (await db`select status from pages where id = ${pageId}`)[0].status).toBe("draft");
    const gone = await reader.goto(`/docs/${slug}`);
    expect(gone?.status()).toBe(404);
    await visitor.close();
  });

  test("an unknown docs path is a real 404", async ({ request }) => {
    const res = await request.get(`/docs/tidak-ada-${uid()}`);
    expect(res.status()).toBe(404);
  });

  test("categories: the list shows seeded categories and their pages", async ({ page }) => {
    await page.goto("/admin/pages");
    await expect(page.getByRole("link", { name: /Mulai/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Lanjutan/ }).first()).toBeVisible();
    await expect(page.getByText("Instalasi").first()).toBeVisible();
  });

  test("an editor cannot open settings", async ({ browser }) => {
    const context = await browser.newContext({ storageState: EDITOR });
    const page = await context.newPage();
    await page.goto("/admin/settings");
    await expect(page).not.toHaveURL(/\/admin\/settings$/);
    await context.close();
  });

  test("revision diff and restore", async ({ page, db, state }) => {
    const id = uid();
    const pageId = await createPage(db, state, { slug: `revisi-${id}`, title: `Judul baru ${id}`, status: "draft" });
    const oldContent = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Paragraf lama saja." }] }] };
    await db`
      insert into page_revisions (page_id, title, description, content, reason, created_by_id)
      values (${pageId}, ${`Judul lama ${id}`}, '', ${JSON.stringify(oldContent)}::jsonb, 'save', (select id from users where email = ${state.users.admin.email}))`;

    await page.goto(`/admin/pages/${pageId}`);
    await page.getByRole("button", { name: "Pengaturan halaman" }).click();
    await page.getByRole("button", { name: /^Bandingkan revisi/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Bandingkan revisi" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`Judul lama ${id}`).first()).toBeVisible();
    await expect(dialog.getByText("Paragraf lama saja.").first()).toBeVisible();
    await expect(dialog.getByText(/\+\d+/).first()).toBeVisible();

    await dialog.getByRole("button", { name: "Pulihkan revisi ini" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Pulihkan" }).click();
    await expect.poll(async () => (await db`select draft_title from pages where id = ${pageId}`)[0].draft_title).toBe(`Judul lama ${id}`);
    // Restoring keeps what it replaced, so it can be undone.
    await expect.poll(async () => (await db`select count(*)::int as n from page_revisions where page_id = ${pageId} and reason = 'before-restore'`)[0].n).toBe(1);
  });
});
