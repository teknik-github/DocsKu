import { ADMIN, createPage, expect, test, uid } from "../support/fixtures";

test.describe("comments", () => {
  test("a visitor comments, a linked comment waits for approval, the team approves and replies", async ({ page, browser, db, state }) => {
    const id = uid();
    const slug = `komentar-${id}`;
    await createPage(db, state, { slug, title: `Halaman komentar ${id}` });

    // A visitor (no session) writes a plain comment: shown at once (moderation is off by default).
    await page.goto(`/docs/${slug}`);
    const section = page.getByTestId("page-comments");
    await section.getByLabel("Tulis komentar").fill(`Komentar biasa ${id}`);
    await section.getByLabel("Nama", { exact: true }).fill("Pembaca Uji");
    // The form refuses submissions faster than 3 s (a bot guard), so wait like a person would.
    await page.waitForTimeout(3200);
    await section.getByRole("button", { name: "Kirim komentar" }).click();
    await expect(section.getByText(`Komentar biasa ${id}`)).toBeVisible();

    // A comment with a link is held for moderation (sent through the API, as the browser would).
    const res = await page.request.post("/api/comments", {
      headers: { origin: state.baseURL },
      data: { slug, name: "Pembaca Tautan", body: `Lihat https://contoh.test/${id}`, elapsed: 5000 },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).status).toBe("pending");
    // The honeypot field silently drops bots.
    const bot = await page.request.post("/api/comments", { headers: { origin: state.baseURL }, data: { slug, name: "Bot", body: "spam spam", website: "x", elapsed: 5000 } });
    expect(bot.status()).toBe(201);
    expect(await db`select 1 from page_comments where author_name = 'Bot'`).toHaveLength(0);

    // The team approves it and replies from the dashboard.
    const team = await browser.newContext({ storageState: ADMIN });
    const admin = await team.newPage();
    await admin.goto(`/admin/comments?view=pending&q=${id}`);
    const row = admin.getByTestId("admin-comment").filter({ hasText: "Pembaca Tautan" });
    await row.hover();
    await row.getByRole("button", { name: "Setujui" }).click();
    await expect(admin.getByText("Komentar disetujui.")).toBeVisible();
    await admin.goto(`/admin/comments?q=${id}`);
    const approved = admin.getByTestId("admin-comment").filter({ hasText: "Pembaca Tautan" });
    await approved.hover();
    await approved.getByRole("button", { name: "Balas" }).click();
    await admin.getByLabel("Balasan untuk Pembaca Tautan").fill(`Terima kasih ${id}`);
    await admin.getByLabel("Balasan untuk Pembaca Tautan").press("Control+Enter");
    await expect.poll(async () => (await db`select count(*)::int as n from page_comments where body = ${`Terima kasih ${id}`} and is_staff`)[0].n).toBe(1);
    await team.close();

    await page.reload();
    await expect(section.getByText(`Lihat https://contoh.test/${id}`)).toBeVisible();
    await expect(section.getByText(`Terima kasih ${id}`)).toBeVisible();
  });
});
