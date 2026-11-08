import { ADMIN, EDITOR, createPage, expect, test, uid } from "../support/fixtures";

/** Internal-note emails are queued for the page's author and the people in the conversation; the dashboard links to the note. */
test("team notes notify the author, show on the dashboard, and open from a link", async ({ browser, db, state }) => {
  const id = uid();
  // Email "on" with an unreachable server: rows are queued in the outbox, nothing is sent.
  await db`insert into settings (key, value) values ('email', ${JSON.stringify({ enabled: true, host: "127.0.0.1", port: 9, security: "none", user: "", password: "", fromName: "Docs", fromAddress: "docs@contoh.test" })}::jsonb)
    on conflict (key) do update set value = excluded.value`;
  try {
    const pageId = await createPage(db, state, { slug: `catatan-email-${id}`, title: `Catatan email ${id}`, body: `Paragraf yang perlu dicek ${id}.` });

    // An editor writes a note on the admin's page.
    const editorContext = await browser.newContext({ storageState: EDITOR });
    const editor = await editorContext.newPage();
    await editor.goto(`/admin/pages/${pageId}`);
    await expect(editor.locator("header").first()).toContainText("Tersimpan", { timeout: 60_000 });
    await editor.locator(".ProseMirror p", { hasText: id }).click();
    await editor.keyboard.press("Home");
    await editor.keyboard.press("Shift+End");
    await editor.getByRole("button", { name: "Catatan internal" }).click();
    await editor.getByTestId("note-composer").locator("textarea").fill(`Tolong cek ${id}`);
    await editor.getByRole("button", { name: "Simpan catatan" }).click();
    await expect(editor.locator("[data-note-card]")).toContainText(`Tolong cek ${id}`);

    const [note] = await db`select id from page_notes where page_id = ${pageId} and parent_id is null`;
    await expect
      .poll(async () => (await db`select "to", subject, text from email_outbox where event = 'note.new' and text like ${`%Tolong cek ${id}%`}`).map((row) => row.to))
      .toEqual([state.users.admin.email]);
    const [mail] = await db`select subject, text from email_outbox where event = 'note.new' and text like ${`%Tolong cek ${id}%`}`;
    expect(mail.subject).toContain(`Catatan tim di “Catatan email ${id}”`);
    expect(mail.text).toContain(`/admin/pages/${pageId}?catatan=${note.id}`);

    // The admin sees it on the dashboard and opens it; their reply notifies the editor (a participant).
    const adminContext = await browser.newContext({ storageState: ADMIN });
    const admin = await adminContext.newPage();
    await admin.goto("/admin");
    const open = admin.getByTestId("open-notes");
    await expect(open).toContainText(`Catatan email ${id}`);
    await open.getByRole("link", { name: new RegExp(`Catatan email ${id}`) }).click();
    await admin.waitForURL(`**/admin/pages/${pageId}?catatan=${note.id}`);
    const card = admin.locator(`[data-note-card="${note.id}"]`);
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/border-amber-400/);
    await card.getByRole("button", { name: "Balas" }).click();
    await admin.getByPlaceholder("Balas…").fill(`Sudah ${id}`);
    await card.getByRole("button", { name: "Balas", exact: true }).click();
    await expect
      .poll(async () => (await db`select "to" from email_outbox where event = 'note.new' and text like ${`%Sudah ${id}%`}`).map((row) => row.to))
      .toEqual([state.users.editor.email]);

    await editorContext.close();
    await adminContext.close();
  } finally {
    await db`delete from settings where key = 'email'`;
    await db`delete from email_outbox where event = 'note.new'`;
  }
});
