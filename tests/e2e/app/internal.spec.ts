import { ADMIN, expect, test } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

const internal = `/docs/${SEED_PAGES.internal.slug}`;

test.describe("internal articles", () => {
  test("a visitor gets the same 404 for an internal article as for a missing page", async ({ request }) => {
    const hidden = await request.get(internal);
    const missing = await request.get("/docs/tim/tidak-pernah-ada");
    expect(hidden.status()).toBe(404);
    expect(missing.status()).toBe(404);
    const strip = (html: string) => html.replace(/\/tim\/[a-z-]+/g, "");
    expect(strip(await hidden.text())).toBe(strip(await missing.text()));
    expect(await hidden.text()).not.toContain("Wi-Fi");
  });

  test("it never reaches the public search index, sitemap or llms.txt", async ({ request }) => {
    const docs = await (await request.get("/docs")).text();
    expect(docs).not.toContain(SEED_PAGES.internal.title);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain(SEED_PAGES.internal.slug);
    expect(await (await request.get("/llms-full.txt")).text()).not.toContain("Wi-Fi");
  });

  test.describe("signed in", () => {
    test.use({ storageState: ADMIN });
    test("the team reads it with a banner, and finds it in the /internal hub", async ({ page }) => {
      const res = await page.goto(internal);
      expect(res?.status()).toBe(200);
      await expect(page.getByText("Kata sandi Wi-Fi kantor ada di lemari.")).toBeVisible();
      await expect(page.getByText(/internal/i).first()).toBeVisible();
      await page.goto("/internal");
      await expect(page.getByRole("link", { name: SEED_PAGES.internal.title })).toBeVisible();
    });
  });
});
