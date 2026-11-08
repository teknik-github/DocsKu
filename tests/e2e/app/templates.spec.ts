import { ADMIN, createPage, expect, test, uid } from "../support/fixtures";

test.use({ storageState: ADMIN });

test("save a page as a template, use it for a new page, then delete it", async ({ page, db, state }) => {
  const id = uid();
  const body = `Isi templat khusus ${id}`;
  const pageId = await createPage(db, state, { slug: `sumber-templat-${id}`, title: `Sumber ${id}`, status: "draft", body });
  await page.goto(`/admin/pages/${pageId}`);
  await page.getByRole("button", { name: "Pengaturan halaman" }).click();
  await page.getByRole("button", { name: "Simpan sebagai templat" }).click();
  await page.getByLabel("Nama templat").fill(`Templat ${id}`);
  await page.getByRole("button", { name: "Simpan templat" }).click();
  await expect(page.getByText(`Templat “Templat ${id}” tersimpan.`)).toBeVisible();

  await page.goto("/admin/templates");
  await expect(page.getByText(`Templat ${id}`).first()).toBeVisible();
  await page.goto("/admin/pages");
  await page.getByRole("button", { name: /Halaman baru/ }).first().click();
  await page.getByRole("dialog").getByRole("radio", { name: new RegExp(`Templat ${id}`) }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Buat halaman" }).click();
  await page.waitForURL(/\/admin\/pages\/[0-9a-f-]{36}/);
  await expect(page.locator(".ProseMirror")).toContainText(body);

  await page.goto("/admin/templates");
  await page.getByRole("button", { name: `Hapus Templat ${id}` }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click();
  await expect.poll(async () => (await db`select count(*)::int as n from page_templates where name = ${`Templat ${id}`}`)[0].n).toBe(0);
});
