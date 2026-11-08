import { ADMIN, expect, overflow, test } from "../support/fixtures";

const PAGES = ["/admin", "/admin/pages", "/admin/review", "/admin/media", "/admin/stats", "/admin/comments", "/admin/theme", "/admin/navigation", "/admin/redirects", "/admin/users", "/admin/activity", "/admin/settings", "/admin/profile", "/admin/templates", "/admin/home", "/admin/mcp", "/admin/pages/impor"];

test.use({ storageState: ADMIN });

for (const path of PAGES) {
  test(`admin page ${path} loads without errors`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("main").first()).toBeVisible();
  });
}

test("admin pages fit a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/admin", "/admin/pages", "/admin/comments", "/admin/review", "/admin/activity", "/admin/settings", "/admin/profile", "/admin/users"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await overflow(page), path).toBeLessThanOrEqual(1);
  }
});
