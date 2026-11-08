import { ADMIN, expect, refreshCache, test } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

test.use({ storageState: ADMIN });
test.describe.configure({ mode: "serial" });

test.describe("help widget", () => {
  test("off by default: /widget.js does nothing and /widget is a 404", async ({ request }) => {
    const script = await request.get("/widget.js");
    expect(script.status()).toBe(200);
    expect(script.headers()["content-type"]).toContain("javascript");
    expect((await script.text()).length).toBeLessThan(400);
    expect((await request.get("/widget")).status()).toBe(404);
  });

  test("switched on for one origin: framing allowed only there, articles open inside", async ({ page, request, db, state }) => {
    await page.goto("/admin/settings#widget");
    const section = page.locator("#widget");
    await section.getByLabel(/Aktifkan widget/).check();
    await section.getByPlaceholder(/app\.contoh\.com/).fill("https://bantuan.contoh.test");
    await section.getByRole("button", { name: "Simpan" }).click();
    await expect.poll(async () => (await db`select value from settings where key = 'widget'`)[0]?.value?.enabled).toBe(true);

    // proxy.ts decides on/off per request, so the very first request after saving is already a 200.
    const res = await request.get("/widget");
    expect(res.status()).toBe(200);
    const csp = res.headers()["content-security-policy"];
    expect(csp).toContain("frame-ancestors");
    expect(csp).toContain("https://bantuan.contoh.test");
    expect(res.headers()["x-frame-options"]).toBeUndefined();
    // Every other page still refuses to be framed.
    expect((await request.get(`/docs/${SEED_PAGES.intro.slug}`)).headers()["x-frame-options"]).toBe("DENY");
    expect((await request.get(`/widget/a/${SEED_PAGES.intro.slug}`)).status()).toBe(200);
    expect((await request.get("/widget/a/tidak-ada")).status()).toBe(404);
    expect((await request.get(`/widget/a/${SEED_PAGES.internal.slug}`)).status()).toBe(404);
    expect((await (await request.get("/widget.js")).text()).length).toBeGreaterThan(1000);

    await db`delete from settings where key = 'widget'`;
    await refreshCache(state);
  });
});
