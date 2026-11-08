import { expect, test } from "../support/fixtures";

test.describe("crawler files and AI isolation", () => {
  test("sitemap lists public pages only", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/xml");
    const xml = await res.text();
    expect(xml).toContain("/docs/pengenalan</loc>");
    expect(xml).toContain("/docs/panduan/instalasi</loc>");
    expect(xml).not.toContain("tim/rahasia");
  });

  test("robots.txt keeps crawlers out of the dashboard", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    expect(body).toContain("Disallow: /admin");
    expect(body).toMatch(/Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
  });

  test("llms.txt and llms-full.txt describe the public docs", async ({ request }) => {
    const index = await (await request.get("/llms.txt")).text();
    expect(index).toContain("# Docsku E2E");
    expect(index).toContain("[Pengenalan](");
    expect(index).not.toContain("Catatan tim rahasia");
    const full = await (await request.get("/llms-full.txt")).text();
    expect(full).toContain("Selamat datang di situs uji.");
    expect(full).not.toContain("Wi-Fi");
  });

  test("AI is off: Tanya AI refuses and never calls a provider", async ({ request }) => {
    const res = await request.post("/api/ask", { data: { question: "Bagaimana cara instalasi?" }, headers: { origin: test.info().project.use.baseURL! } });
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "Tanya AI sedang tidak aktif." });
  });
});
