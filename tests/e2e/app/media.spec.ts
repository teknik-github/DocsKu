import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, refreshCache, test } from "../support/fixtures";

/** Responsive uploads: `/media/<file>?w=` resized WebP variants, and srcset/width/height in published content. */
test.describe("media variants", () => {
  test("serves resized WebP variants from an allow-list, never enlarged, GIFs untouched", async ({ request, state }) => {
    const file = `${randomUUID()}.png`;
    const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#3366cc" } }).png().toBuffer();
    fs.writeFileSync(path.join(state.uploadDir, file), png);

    const original = await request.get(`/media/${file}`);
    expect(original.status()).toBe(200);
    expect(original.headers()["content-type"]).toBe("image/png");

    const small = await request.get(`/media/${file}?w=640`);
    expect(small.status()).toBe(200);
    expect(small.headers()["content-type"]).toBe("image/webp");
    expect(small.headers()["content-security-policy"]).toContain("default-src 'none'");
    expect((await sharp(await small.body()).metadata()).width).toBe(640);

    // Asking for more than the original gives the original width.
    expect((await sharp(await (await request.get(`/media/${file}?w=1920`)).body()).metadata()).width).toBe(1200);
    // Only listed widths are made.
    expect((await request.get(`/media/${file}?w=641`)).status()).toBe(400);
    expect((await request.get(`/media/${randomUUID()}.png?w=640`)).status()).toBe(404);

    const gif = `${randomUUID()}.gif`;
    fs.writeFileSync(path.join(state.uploadDir, gif), await sharp({ create: { width: 40, height: 20, channels: 3, background: "#000" } }).gif().toBuffer());
    const gifVariant = await request.get(`/media/${gif}?w=160`);
    expect(gifVariant.headers()["content-type"]).toBe("image/gif");
  });

  test("published content gets srcset, sizes and the image's real width and height", async ({ request, db, state }) => {
    const file = `${randomUUID()}.jpg`;
    fs.writeFileSync(path.join(state.uploadDir, file), await sharp({ create: { width: 1000, height: 500, channels: 3, background: "#cc6633" } }).jpeg().toBuffer());
    const slug = `uji-media-${Date.now()}`;
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Gambar di bawah." }] },
        { type: "image", attrs: { src: `/media/${file}`, alt: "Contoh gambar" } },
      ],
    };
    await db`insert into pages (slug, title, description, content, draft_title, draft_description, draft_content, status, published_at)
      values (${slug}, 'Uji media', '', ${db.json(doc)}, 'Uji media', '', ${db.json(doc)}, 'published', now())`;
    try {
      await refreshCache(state);
      const html = await (await request.get(`/docs/${slug}`)).text();
      const img = html.match(/<img[^>]*alt="Contoh gambar"[^>]*>/)?.[0] ?? "";
      expect(img).toContain(`/media/${file}?w=640 640w`);
      // The 1000px original is offered at full size through the next allowed width, and nothing bigger.
      expect(img).toContain(`/media/${file}?w=1280 1000w`);
      expect(img).not.toContain("?w=1920");
      expect(img).toContain('width="1000"');
      expect(img).toContain('height="500"');
      expect(img).toMatch(/sizes="[^"]+"/);
      expect(img).toContain('loading="lazy"');
    } finally {
      await db`delete from pages where slug = ${slug}`;
      await refreshCache(state);
    }
  });
});
