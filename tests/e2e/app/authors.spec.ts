import { ADMIN, createPage, expect, test, uid } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

test.describe("author profiles", () => {
  test("articles show the author byline and box; the author page lists public articles only", async ({ page, db, state }) => {
    const id = uid();
    await createPage(db, state, { slug: `draf-penulis-${id}`, title: `Draf penulis ${id}`, status: "draft" });
    await page.goto(`/docs/${SEED_PAGES.intro.slug}`);
    await expect(page.getByText("Admin Uji").first()).toBeVisible();
    await expect(page.getByText("Admin Uji adalah seorang DevOps yang menulis panduan uji.")).toBeVisible();

    const res = await page.goto("/penulis/admin-uji");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Admin Uji", exact: true })).toBeVisible();
    await expect(page.getByText(SEED_PAGES.intro.title).first()).toBeVisible();
    await expect(page.getByText(SEED_PAGES.internal.title)).toHaveCount(0);
    await expect(page.getByText(`Draf penulis ${id}`)).toHaveCount(0);
  });

  test("an unknown author is a real 404", async ({ request }) => {
    expect((await request.get(`/penulis/tidak-ada-${uid()}`)).status()).toBe(404);
  });

  test.describe("profile", () => {
    test.use({ storageState: ADMIN });
    test("the profile page validates the username", async ({ page }) => {
      await page.goto("/admin/profile");
      const username = page.getByLabel("Username", { exact: true });
      await username.fill("ab");
      await expect(page.getByText("Minimal 3 karakter.")).toBeVisible();
      await username.fill("admin");
      await expect(page.getByText("Nama ini dipakai sistem. Pilih yang lain.")).toBeVisible();
    });
  });
});
