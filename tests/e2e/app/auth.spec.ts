import { expect, login, test, totp } from "../support/fixtures";

test.describe("sign-in", () => {
  test("a wrong password is refused and logged", async ({ page, state, db }) => {
    await login(page, { ...state.users.lockout, password: "bukan-password-ini" });
    await expect(page.getByText("Email atau password salah.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect
      .poll(async () => (await db`select count(*)::int as n from activity_log where action = 'auth.login_failed' and meta->>'email' = ${state.users.lockout.email}`)[0].n)
      .toBeGreaterThan(0);
  });

  test("dashboard pages need a session", async ({ page }) => {
    await page.goto("/admin/pages");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("two-step login", () => {
  test.describe.configure({ mode: "serial" });
  let secret = "";
  let codes: string[] = [];

  test("enable 2FA in Profil and get ten recovery codes", async ({ page, state }) => {
    await login(page, state.users.twofa);
    await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"));
    await page.goto("/admin/profile");
    await page.getByRole("button", { name: "Aktifkan verifikasi dua langkah" }).click();
    secret = (await page.getByTestId("totp-secret").textContent())!.trim();
    await page.getByLabel("Kode dari aplikasi").fill("000000");
    await page.getByRole("button", { name: "Aktifkan", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByLabel("Kode dari aplikasi").fill(totp(secret));
    await page.getByRole("button", { name: "Aktifkan", exact: true }).click();
    await expect(page.getByText("Simpan kode pemulihan ini sekarang")).toBeVisible();
    codes = [...new Set((await page.locator("body").innerText()).match(/\b[a-z0-9]{4}-[a-z0-9]{4}\b/g) ?? [])];
    expect(codes).toHaveLength(10);
    await page.getByRole("button", { name: "Sudah saya simpan" }).click();
    await expect(page.getByText("Sisa 10 kode pemulihan.")).toBeVisible();
  });

  test("the password alone opens nothing; a TOTP code signs in", async ({ page, state }) => {
    await login(page, state.users.twofa);
    await page.waitForURL(/\/admin\/login\/verify/);
    await page.goto("/admin/pages");
    await expect(page).toHaveURL(/\/admin\/login/);
    await login(page, state.users.twofa);
    await page.waitForURL(/\/admin\/login\/verify/);
    // The next step's code: the current one was used to switch 2FA on and can't be replayed.
    await page.getByLabel("Kode autentikator").fill(totp(secret, 1));
    await page.getByRole("button", { name: "Verifikasi" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"));
  });

  test("a recovery code works once", async ({ page, state }) => {
    await login(page, state.users.twofa);
    await page.waitForURL(/\/admin\/login\/verify/);
    await page.getByRole("button", { name: "Pakai kode pemulihan" }).click();
    await page.getByLabel("Kode pemulihan").fill(codes[0]);
    await page.getByRole("button", { name: "Verifikasi" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"));
    await page.goto("/admin/profile");
    await expect(page.getByText("Sisa 9 kode pemulihan.")).toBeVisible();

    await page.context().clearCookies();
    await login(page, state.users.twofa);
    await page.waitForURL(/\/admin\/login\/verify/);
    await page.getByRole("button", { name: "Pakai kode pemulihan" }).click();
    await page.getByLabel("Kode pemulihan").fill(codes[0]);
    await page.getByRole("button", { name: "Verifikasi" }).click();
    await expect(page.getByText(/Kode salah atau sudah dipakai/)).toBeVisible();
  });

  test("five wrong codes end the attempt with a reason", async ({ page, state }) => {
    await login(page, state.users.twofa);
    await page.waitForURL(/\/admin\/login\/verify/);
    for (let i = 0; i < 5; i++) {
      await page.getByLabel("Kode autentikator").fill("000000");
      await page.getByRole("button", { name: "Verifikasi" }).click();
      if (i < 4) await expect(page.getByText(`Sisa ${4 - i} percobaan.`)).toBeVisible();
    }
    await expect(page.getByText(/Terlalu banyak kode salah|Verifikasi dua langkah berakhir/)).toBeVisible();
  });

  test("2FA can be switched off with the password", async ({ page, state }) => {
    await login(page, state.users.twofa);
    await page.waitForURL(/\/admin\/login\/verify/);
    await page.getByRole("button", { name: "Pakai kode pemulihan" }).click();
    await page.getByLabel("Kode pemulihan").fill(codes[1]);
    await page.getByRole("button", { name: "Verifikasi" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"));
    await page.goto("/admin/profile");
    await page.getByRole("button", { name: "Nonaktifkan" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Lanjut" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.locator("input").fill(state.users.twofa.password);
    await dialog.getByRole("button", { name: "Nonaktifkan" }).click();
    await expect(page.getByText(/Belum aktif/)).toBeVisible();
  });
});
