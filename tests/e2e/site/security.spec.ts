import { expect, login, test, totp } from "../support/fixtures";

test.describe.configure({ mode: "serial" });

test("an admin can require 2FA for admins once their own account uses it", async ({ page, browser, state, db }) => {
  // The "strict" admin turns 2FA on for themselves first.
  await login(page, state.users.strict);
  await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"));
  await page.goto("/admin/profile");
  await page.getByRole("button", { name: "Aktifkan verifikasi dua langkah" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
  await page.getByLabel("Kode dari aplikasi").fill(totp(secret));
  await page.getByRole("button", { name: "Aktifkan", exact: true }).click();
  await page.getByRole("button", { name: "Sudah saya simpan" }).click();

  await page.goto("/admin/settings#keamanan");
  const section = page.locator("#keamanan");
  await section.getByLabel(/Wajibkan verifikasi dua langkah untuk admin/).check();
  await section.getByRole("button", { name: "Simpan" }).click();
  await expect.poll(async () => (await db`select value from settings where key = 'security'`)[0]?.value?.requireAdmin2fa).toBe(true);

  // Another admin without 2FA is sent to Profil after signing in.
  const other = await browser.newContext();
  const adminPage = await other.newPage();
  await login(adminPage, state.users.admin);
  await adminPage.waitForURL(/\/admin\/profile\?2fa=wajib/);
  await expect(adminPage.getByText(/wajib memakai verifikasi dua langkah/).first()).toBeVisible();
  await other.close();

  // Editors are not affected.
  const editorContext = await browser.newContext();
  const editorPage = await editorContext.newPage();
  await login(editorPage, state.users.editor);
  await editorPage.waitForURL((url) => !url.pathname.startsWith("/admin/login"));
  expect(editorPage.url()).not.toContain("2fa=wajib");
  await editorContext.close();

  await section.getByLabel(/Wajibkan verifikasi dua langkah untuk admin/).uncheck();
  await section.getByRole("button", { name: "Simpan" }).click();
  await expect.poll(async () => (await db`select value from settings where key = 'security'`)[0]?.value?.requireAdmin2fa).toBe(false);
});
