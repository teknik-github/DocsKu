import { expect, test } from "../support/fixtures";

/** The weekly link check, forced through the scheduler: broken links are emailed to admins (queued in the outbox). */
test("the weekly link check emails broken links", async ({ db, state }) => {
  await db`insert into settings (key, value) values ('email', ${JSON.stringify({ enabled: true, host: "127.0.0.1", port: 9, security: "none", user: "", password: "", fromName: "Docs", fromAddress: "docs@contoh.test" })}::jsonb)
    on conflict (key) do update set value = excluded.value`;
  try {
    const res = await fetch(`${state.baseURL}/api/internal/publish-scheduled?periksa-tautan=1`, { method: "POST", headers: { authorization: `Bearer ${state.cronSecret}` } });
    expect(res.ok).toBe(true);
    // Runs after the response.
    await expect
      .poll(async () => (await db`select "to", text from email_outbox where event = 'links.broken'`).map((row) => row.to), { timeout: 60_000 })
      .toContain(state.users.admin.email);
    const [mail] = await db`select subject, text from email_outbox where event = 'links.broken' and "to" = ${state.users.admin.email}`;
    expect(mail.text).toContain("/docs/tidak-ada-sama-sekali");
    expect(mail.text).toContain("halaman tidak ada");
    const [log] = await db`select meta from activity_log where action = 'links.check' order by created_at desc limit 1`;
    expect(log.meta.auto).toBe(true);
  } finally {
    await db`delete from settings where key = 'email'`;
    await db`delete from email_outbox where event = 'links.broken'`;
  }
});
