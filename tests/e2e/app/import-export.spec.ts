import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { ADMIN, EDITOR, expect, test, uid } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

test.describe("export and import", () => {
  test.use({ storageState: ADMIN });

  test("the docs ZIP has one MDX file per published page with front-matter, and no internal pages by default", async ({ page }) => {
    const res = await page.request.get("/admin/api/export");
    expect(res.status()).toBe(200);
    const files = unzipSync(new Uint8Array(await res.body()));
    const names = Object.keys(files);
    expect(names).toContain("navigation.json");
    const intro = names.find((name) => name.endsWith("pengenalan.mdx"));
    expect(intro, names.join(", ")).toBeTruthy();
    const text = strFromU8(files[intro!]);
    expect(text).toMatch(/^---\n[\s\S]*title: "?Pengenalan"?/);
    expect(text).toContain("Selamat datang di situs uji.");
    expect(names.some((name) => name.includes("rahasia"))).toBe(false);

    const json = await page.request.get("/admin/api/export?jenis=json");
    const body = await json.text();
    expect(body).toContain(SEED_PAGES.install.title);
    expect(body).not.toMatch(/password_hash|passwordHash|totp|scrypt\$/i);
  });

  test("import a Markdown ZIP as drafts with rewritten links", async ({ page, db }) => {
    const id = uid();
    const zip = zipSync({
      [`ekspor-${id}/mulai-${id}.md`]: strToU8(`---\ntitle: Mulai impor ${id}\ndescription: Dari ZIP\n---\n\nLihat [langkah berikutnya](./lanjut-${id}.md).\n\n## Bagian\n\nTeks.\n`),
      [`ekspor-${id}/lanjut-${id}.md`]: strToU8(`# Lanjut impor ${id}\n\nHalaman kedua.\n`),
      "../keluar.md": strToU8("# Tidak boleh\n"),
    });
    await page.goto("/admin/pages/impor");
    await page.getByLabel("Berkas untuk diimpor").setInputFiles({ name: `impor-${id}.zip`, mimeType: "application/zip", buffer: Buffer.from(zip) });
    await page.getByRole("button", { name: "Baca berkas" }).click();
    await expect(page.getByLabel("Judul").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Impor 2 halaman$/ })).toBeVisible();
    await page.getByRole("button", { name: /^Impor 2 halaman$/ }).click();
    await expect.poll(async () => (await db`select count(*)::int as n from pages where draft_title like ${`%impor ${id}`}`)[0].n).toBe(2);
    const rows = await db`select status, slug, draft_content::text as content from pages where draft_title = ${`Mulai impor ${id}`}`;
    expect(rows[0].status).toBe("draft");
    const [second] = await db`select slug from pages where draft_title = ${`Lanjut impor ${id}`}`;
    expect(rows[0].content).toContain(`/docs/${second.slug}`);
    expect((await db`select count(*)::int as n from pages where draft_title = 'Tidak boleh'`)[0].n).toBe(0);
  });

  test("editors can't download exports", async ({ browser }) => {
    const context = await browser.newContext({ storageState: EDITOR });
    const res = await context.request.get("/admin/api/export");
    expect(res.status()).toBe(403);
    await context.close();
  });
});
