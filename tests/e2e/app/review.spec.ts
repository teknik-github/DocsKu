import { ADMIN, expect, test } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

test.use({ storageState: ADMIN });

test.describe("content review", () => {
  test("a page past its review date is listed and can be marked reviewed", async ({ page, db }) => {
    await page.goto("/admin/review");
    const row = page.getByRole("listitem").filter({ hasText: SEED_PAGES.old.title });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Tandai ${SEED_PAGES.old.title} sudah ditinjau` }).click();
    await expect.poll(async () => (await db`select reviewed_at from pages where slug = ${SEED_PAGES.old.slug}`)[0].reviewed_at).not.toBeNull();
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: SEED_PAGES.old.title })).toHaveCount(0);
  });

  test("a link to a missing page is reported as broken", async ({ page }) => {
    await page.goto("/admin/review?tab=tautan");
    await expect(page.getByText("/docs/tidak-ada-sama-sekali").first()).toBeVisible();
    await expect(page.getByText(SEED_PAGES.install.title).first()).toBeVisible();
  });
});
