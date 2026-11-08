import { createPage, expect, refreshCache, test, uid } from "../support/fixtures";

test.describe("what's new and RSS", () => {
  test("lists new and updated pages, newest first, with an RSS feed", async ({ page, db, state }) => {
    const id = uid();
    const fresh = await createPage(db, state, { slug: `baru-${id}`, title: `Baru ${id}` });
    const older = await createPage(db, state, { slug: `diperbarui-${id}`, title: `Diperbarui ${id}` });
    // Published three days ago, published again just now: "Diperbarui".
    await db`update pages set published_at = now() - interval '3 days' where id = ${older}`;
    await db`insert into page_revisions (page_id, title, description, content, reason) select id, title, description, content, 'publish' from pages where id = ${older}`;
    await db`update pages set published_at = now() - interval '1 minute' where id = ${fresh}`;
    await refreshCache(state);

    await page.goto("/terbaru");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Apa yang baru");
    const entryOf = (title: string) => page.locator("[data-changelog-entry]", { hasText: title });
    await expect(entryOf(`Baru ${id}`)).toContainText("Baru");
    await expect(entryOf(`Diperbarui ${id}`)).toContainText("Diperbarui");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Apa yang baru" })).toBeVisible();

    const res = await page.request.get("/rss.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/rss+xml");
    const xml = await res.text();
    expect(xml).toContain(`<title>Baru ${id}</title>`);
    expect(xml).toContain(`<title>Diperbarui ${id} (Diperbarui)</title>`);
    expect(xml).toContain(`/docs/baru-${id}</link>`);
    // Internal and draft pages never appear.
    expect(xml).not.toContain("Catatan tim rahasia");
  });
});
