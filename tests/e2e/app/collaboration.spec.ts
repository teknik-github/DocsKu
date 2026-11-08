import type { Browser, Page } from "@playwright/test";
import { hashPassword } from "@/lib/auth/password";
import { ADMIN, EDITOR, createPage, expect, login, overflow, test, uid } from "../support/fixtures";
import type postgres from "postgres";

/** A contributor account for this test (the seed has none), signed in in its own context. */
async function contributor(browser: Browser, db: postgres.Sql, id: string): Promise<{ page: Page; email: string; close: () => Promise<void> }> {
  const email = `kontributor-${id}@e2e.test`;
  const password = `e2e-${id}-${Math.random().toString(36).slice(2)}`;
  await db`insert into users (email, name, password_hash, role) values (${email}, ${`Kontributor ${id}`}, ${await hashPassword(password)}, 'contributor'::role)`;
  // Start signed out: the project's default storage state would sign this context in as the admin.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await login(page, { email, password, name: `Kontributor ${id}` });
  await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"));
  return { page, email, close: () => context.close() };
}

async function typeAtEnd(page: Page, text: string) {
  await page.locator(".ProseMirror p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

const saved = (page: Page) => expect(page.locator("header").first()).toContainText("Tersimpan", { timeout: 60_000 });

test.describe("roles and approval", () => {
  test.use({ storageState: EDITOR });

  test("a contributor submits, the editor asks for changes, then approves", async ({ page, browser, db, state }) => {
    const id = uid();
    const c = await contributor(browser, db, id);
    const pageId = await createPage(db, state, { slug: `ajuan-${id}`, title: `Ajuan ${id}`, status: "draft", authorEmail: c.email });
    const other = await createPage(db, state, { slug: `bukan-milik-${id}`, title: `Bukan milik ${id}`, status: "draft" });

    // Staff pages and other people's pages are out of reach.
    for (const path of ["/admin/stats", "/admin/comments", "/admin/settings", "/admin/pages/impor"]) {
      await c.page.goto(path);
      await expect(c.page).toHaveURL(/\/admin$/);
    }
    await c.page.goto(`/admin/pages/${other}`);
    await expect(c.page).toHaveURL(/\/admin\/pages$/);
    await expect(c.page.getByRole("main")).toContainText(`Ajuan ${id}`);
    await expect(c.page.getByRole("main")).not.toContainText(`Bukan milik ${id}`);
    const presence = await c.page.request.post("/admin/api/presence", { data: { pageId: other, tabId: `tab-${id}-0001` }, headers: { origin: state.baseURL } });
    expect(presence.status()).toBe(404);
    const imported = await c.page.request.post("/admin/api/import", { headers: { origin: state.baseURL }, multipart: { file: { name: "a.md", mimeType: "text/markdown", buffer: Buffer.from("# x") } } });
    expect(imported.status()).toBe(403);

    // Submit with a note.
    await c.page.goto(`/admin/pages/${pageId}`);
    await expect(c.page.locator("header").first()).not.toContainText("Terbitkan");
    await c.page.getByRole("button", { name: /Ajukan untuk ditinjau/ }).click();
    await c.page.getByRole("alertdialog").locator("input").fill("Mohon dicek");
    await c.page.getByRole("alertdialog").getByRole("button", { name: "Ajukan" }).click();
    await expect(c.page.getByTestId("approval-banner")).toContainText("Menunggu persetujuan editor");

    // The editor finds it in the queue and asks for changes.
    await page.goto("/admin/pages?persetujuan=1");
    await expect(page.getByRole("main")).toContainText(`Ajuan ${id}`);
    await page.goto(`/admin/pages/${pageId}`);
    await expect(page.getByTestId("approval-banner")).toContainText("Mohon dicek");
    await page.getByRole("button", { name: "Minta perubahan" }).click();
    await page.getByRole("alertdialog").locator("input").fill(`Tambahkan contoh ${id}`);
    await page.getByRole("alertdialog").getByRole("button", { name: "Kirim" }).click();
    await expect(page.getByTestId("approval-banner")).toContainText("Peninjau meminta perubahan");

    // The contributor sees the note, edits, resubmits.
    await c.page.goto("/admin");
    await expect(c.page.getByRole("main")).toContainText(`Tambahkan contoh ${id}`);
    await c.page.goto(`/admin/pages/${pageId}`);
    await expect(c.page.getByTestId("approval-banner")).toContainText(`Tambahkan contoh ${id}`);
    await typeAtEnd(c.page, ` Contoh ditambahkan ${id}.`);
    await saved(c.page);
    await c.page.getByRole("button", { name: /Ajukan untuk ditinjau/ }).click();
    await c.page.getByRole("alertdialog").getByRole("button", { name: "Ajukan" }).click();
    await expect(c.page.getByTestId("approval-banner")).toContainText("Menunggu persetujuan editor");
    expect(await overflow(c.page)).toBeLessThanOrEqual(1);

    // Approve: the saved working copy goes live.
    await page.goto(`/admin/pages/${pageId}`);
    await page.getByRole("button", { name: /Setujui/ }).click();
    await expect.poll(async () => (await db`select status::text as s, approval_status as a from pages where id = ${pageId}`)[0]).toEqual({ s: "published", a: null });
    const live = await page.request.get(`/docs/ajuan-${id}`);
    expect(live.status()).toBe(200);
    expect(await live.text()).toContain(`Contoh ditambahkan ${id}.`);
    // The action logs right after publishing, so the entry can land a moment after the status changes.
    await expect
      .poll(async () => (await db`select action from activity_log where target_id = ${pageId} order by created_at`).map((r) => r.action))
      .toEqual(expect.arrayContaining(["page.submit", "page.request_changes", "page.approve"]));
    await c.close();
  });
});

test.describe("concurrent edits", () => {
  test.use({ storageState: ADMIN });

  test("a conflicting save is refused, and loading the latest keeps my copy as a revision", async ({ page, browser, db, state }) => {
    const id = uid();
    const pageId = await createPage(db, state, { slug: `bersama-${id}`, title: `Bersama ${id}`, status: "draft" });
    const editorContext = await browser.newContext({ storageState: EDITOR });
    const other = await editorContext.newPage();

    await page.goto(`/admin/pages/${pageId}`);
    await expect(page.locator(".ProseMirror")).toBeVisible();
    await other.goto(`/admin/pages/${pageId}`);
    await expect(other.getByTestId("presence")).toHaveAttribute("aria-label", /Admin Uji/, { timeout: 30_000 });

    await typeAtEnd(other, ` Teks editor ${id}.`);
    await saved(other);
    await typeAtEnd(page, ` Teks admin ${id}.`);
    await expect(page.getByTestId("conflict-banner")).toContainText("diubah oleh Editor Uji", { timeout: 60_000 });
    const [row] = await db`select draft_content::text as c from pages where id = ${pageId}`;
    expect(row.c).toContain(`Teks editor ${id}.`);
    expect(row.c).not.toContain(`Teks admin ${id}.`);

    await page.getByRole("button", { name: "Muat versi terbaru" }).click();
    await expect(page.getByTestId("conflict-banner")).toHaveCount(0);
    await expect(page.locator(".ProseMirror")).toContainText(`Teks editor ${id}.`);
    const [kept] = await db`select count(*)::int as n from page_revisions where page_id = ${pageId} and reason = 'conflict-local' and content::text like ${`%Teks admin ${id}.%`}`;
    expect(kept.n).toBe(1);
    await editorContext.close();
  });
});
