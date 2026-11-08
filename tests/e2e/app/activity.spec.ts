import { ADMIN, EDITOR, createPage, expect, test, uid } from "../support/fixtures";

test.describe("activity log", () => {
  test("publishing-related actions appear as sentences, filterable by kind", async ({ browser, db, state }) => {
    const id = uid();
    const pageId = await createPage(db, state, { slug: `aktivitas-${id}`, title: `Aktivitas ${id}`, status: "draft" });
    const context = await browser.newContext({ storageState: ADMIN });
    const page = await context.newPage();
    // A change made through the dashboard: switch the page to internal from the pages list.
    await page.goto(`/admin/pages/${pageId}`);
    await page.getByRole("button", { name: "Pengaturan halaman" }).click();
    await page.getByRole("radio", { name: /Internal/ }).click();
    await expect.poll(async () => (await db`select visibility from pages where id = ${pageId}`)[0].visibility).toBe("internal");

    await expect.poll(async () => (await db`select count(*)::int as n from activity_log where action = 'page.visibility' and target_id = ${pageId}`)[0].n).toBe(1);
    await page.goto("/admin/activity?jenis=halaman");
    // One entry reads "Admin Uji menjadikan internal Aktivitas …" (actor, verb and linked title are separate elements).
    const entry = page.locator("li").filter({ hasText: `Aktivitas ${id}` }).filter({ hasText: "menjadikan internal" });
    await expect(entry.first()).toContainText("Admin Uji");
    // Other kinds filter it out.
    await page.goto("/admin/activity?jenis=komentar");
    await expect(page.getByText(`Aktivitas ${id}`)).toHaveCount(0);
    await page.goto(`/admin/activity?halaman=${pageId}`);
    await expect(page.getByText(`Aktivitas ${id}`).first()).toBeVisible();
    await context.close();
  });

  test("editors cannot open the activity log", async ({ browser }) => {
    const context = await browser.newContext({ storageState: EDITOR });
    const page = await context.newPage();
    await page.goto("/admin/activity");
    await expect(page).not.toHaveURL(/\/admin\/activity/);
    await context.close();
  });
});
