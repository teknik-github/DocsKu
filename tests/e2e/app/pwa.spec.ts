import { expect, test } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

test.describe("installable and readable offline", () => {
  test("manifest, icons and the service worker; a page read once opens offline", async ({ page, context }) => {
    const manifest = await (await page.request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ name: "Docsku E2E Docs", start_url: "/docs", display: "standalone" });
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toContain("/pwa-icon/512");
    const icon = await page.request.get("/pwa-icon/192");
    expect(icon.headers()["content-type"]).toBe("image/png");
    expect((await page.request.get("/pwa-icon/100")).status()).toBe(404);
    expect((await page.request.get("/sw.js")).headers()["content-type"]).toContain("javascript");

    await page.goto(`/docs/${SEED_PAGES.intro.slug}`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // The first load isn't controlled yet; this one goes through the worker and is kept.
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(SEED_PAGES.intro.title);

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(SEED_PAGES.intro.title);
      await page.goto(`/docs/${SEED_PAGES.old.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sedang offline");
    } finally {
      await context.setOffline(false);
    }
  });
});
