import { ADMIN, createPage, expect, refreshCache, test, uid } from "../support/fixtures";

test.use({ storageState: ADMIN });

const saved = (page: import("@playwright/test").Page) => expect(page.locator("header").first()).toContainText("Tersimpan", { timeout: 60_000 });

test.describe("video and diagram blocks", () => {
  test("insert a video and a Mermaid diagram from the slash menu; the site embeds and draws them", async ({ page, db, state }) => {
    const id = uid();
    const pageId = await createPage(db, state, { slug: `blok-media-${id}`, title: `Blok media ${id}` });
    await page.goto(`/admin/pages/${pageId}`);
    await saved(page);

    // Two empty paragraphs at the end, one for each block.
    await page.locator(".ProseMirror p").last().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    // "/" menu → Video, paste a YouTube link.
    await page.keyboard.type("/video");
    await page.keyboard.press("Enter");
    await page.getByLabel("Tautan video").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30");
    await expect(page.locator(".ProseMirror iframe[src*='youtube-nocookie.com/embed/dQw4w9WgXcQ']")).toBeVisible();
    await page.getByLabel("Keterangan video").fill(`Video uji ${id}`);

    // "/" menu → Diagram (starts with a sample flowchart, previewed in the editor).
    await page.locator(".ProseMirror > p").last().click();
    await page.keyboard.type("/diagram");
    await page.keyboard.press("Enter");
    await expect(page.locator(".ProseMirror [data-mermaid] svg")).toBeVisible({ timeout: 20_000 });
    await saved(page);

    const [row] = await db`select draft_content::text as d from pages where id = ${pageId}`;
    expect(row.d).toContain('"type": "embed"');
    expect(row.d).toContain('"type": "mermaid"');

    // Publish the working copy, then read it as a visitor.
    await db`update pages set content = draft_content, title = draft_title where id = ${pageId}`;
    await refreshCache(state);
    const visitor = await page.context().browser()!.newContext({ storageState: { cookies: [], origins: [] } });
    const reader = await visitor.newPage();
    await reader.goto(`/docs/blok-media-${id}`);
    const frame = reader.locator("[data-embed='youtube'] iframe");
    await expect(frame).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30");
    await expect(frame).toHaveAttribute("loading", "lazy");
    await expect(reader.locator("[data-embed] figcaption")).toHaveText(`Video uji ${id}`);
    await expect(reader.locator("[data-mermaid] svg")).toBeVisible({ timeout: 20_000 });
    await visitor.close();

    // Markdown export keeps both (round trip through the MDX converter).
    const llms = await (await page.request.get("/llms-full.txt")).text();
    expect(llms).toContain(`<Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30" title="Video uji ${id}" />`);
    expect(llms).toContain("```mermaid");
  });
});

test.describe("quality in the page list", () => {
  test("pages get a writing score, and 'Perlu perbaikan' lists the weak ones", async ({ page, db, state }) => {
    const id = uid();
    await createPage(db, state, { slug: `kualitas-baik-${id}`, title: `Kualitas baik ${id}`, status: "draft" });
    const weak = await createPage(db, state, { slug: `kualitas-lemah-${id}`, title: `Kualitas lemah ${id}`, status: "draft" });
    const content = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "Langsung judul kecil" }] },
        { type: "image", attrs: { src: "/media/tidak-ada.png", alt: "" } },
        { type: "paragraph", content: [{ type: "text", text: "di sini", marks: [{ type: "link", attrs: { href: "" } }] }] },
      ],
    };
    await db`update pages set draft_content = ${JSON.stringify(content)}::jsonb where id = ${weak}`;
    await db`update pages set draft_description = 'Deskripsi yang cukup panjang untuk halaman uji kualitas di daftar halaman.' where slug = ${`kualitas-baik-${id}`}`;

    await page.goto(`/admin/pages?q=${id}`);
    const rowOf = (title: string) => page.getByRole("row").filter({ hasText: title });
    await expect(rowOf(`Kualitas baik ${id}`).getByTestId("quality-score")).toContainText("Kualitas 97");
    const weakScore = rowOf(`Kualitas lemah ${id}`).getByTestId("quality-score");
    await expect(weakScore).toContainText("Kualitas");
    expect(Number((await weakScore.textContent())?.replace(/\D/g, ""))).toBeLessThan(85);
    await expect(weakScore).toHaveAttribute("title", /teks alternatif/);

    await page.getByTestId("quality-filter").click();
    await expect(page).toHaveURL(/kualitas=perbaiki/);
    await expect(rowOf(`Kualitas lemah ${id}`)).toBeVisible();
    await expect(rowOf(`Kualitas baik ${id}`)).toHaveCount(0);
  });
});
