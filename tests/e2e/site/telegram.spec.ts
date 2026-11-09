import http from "node:http";
import type { AddressInfo } from "node:net";
import { ADMIN, createPage, expect, test, uid } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";
import { TELEGRAM_PORT } from "../support/env";

/**
 * The Telegram bot against a fake Bot API (TELEGRAM_API_URL points the app at
 * it) and a scripted OpenAI-compatible server: connecting the bot, linking an
 * account with a code, AI Chat with proposal buttons (new draft, edit applied to
 * a draft), commands, and a personal notification with moderation buttons.
 * Nothing reaches Telegram or an AI provider.
 */

type Call = { method: string; body: Record<string, unknown> };
type Button = { text: string; callback_data?: string; url?: string };

function fakeTelegram(): Promise<{ calls: Call[]; secret: () => string; close: () => void }> {
  const calls: Call[] = [];
  let secret = "";
  let messageId = 100;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const method = req.url?.split("/").at(-1) ?? "";
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      calls.push({ method, body });
      if (method === "setWebhook") secret = String(body.secret_token);
      const result =
        method === "getMe" ? { id: 1, is_bot: true, first_name: "Docs Bot", username: "docsku_uji_bot" } : method === "sendMessage" ? { message_id: ++messageId } : true;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, result }));
    });
  });
  return new Promise((resolve) => server.listen(TELEGRAM_PORT, "127.0.0.1", () => resolve({ calls, secret: () => secret, close: () => server.close() })));
}

type AiBody = { messages: { role: string; content: string | null; tool_calls?: { function: { name: string } }[] }[] };
const sse = (res: http.ServerResponse, chunks: object[]) => {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.end("data: [DONE]\n\n");
};
const text = (value: string) => [{ choices: [{ delta: { content: value } }] }, { choices: [{ delta: {}, finish_reason: "stop" }] }];
const toolCall = (name: string, args: object) => [
  { choices: [{ delta: { tool_calls: [{ index: 0, id: `call_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] },
  { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
];

function fakeAi(id: string): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    if (req.method === "GET") return void res.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw) as AiBody;
      const last = body.messages.at(-1)!;
      if (last.role === "tool") return sse(res, text("Sudah saya siapkan, silakan dicek."));
      const content = String(last.content ?? "");
      if (content.includes(`Tulis halaman ${id}`)) {
        return sse(res, toolCall("propose_new_page", { title: `Panduan Telegram ${id}`, description: "Ringkasan singkat.", content: "## Mulai\n\nLangkah **pertama** dari HP." }));
      }
      if (content.includes(`Perbarui lama ${id}`)) {
        return sse(res, toolCall("propose_page_edit", { slug: SEED_PAGES.old.slug, content: `## Intro\n\nDiperbarui dari Telegram ${id}.`, content_mode: "replace", note: "Menyegarkan isi." }));
      }
      return sse(res, text(`Halo dari **AI** ${id}. Lihat [halaman ini](/docs/${SEED_PAGES.intro.slug}).`));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as AddressInfo).port, close: () => server.close() })));
}

test.describe("Telegram bot", () => {
  test.use({ storageState: ADMIN });

  test("connect, link an account, chat with AI, apply proposals, commands and notifications", async ({ page, db, state }) => {
    test.setTimeout(120_000);
    const id = uid();
    const tg = await fakeTelegram();
    const ai = await fakeAi(id);
    const chat = 700000 + Math.floor(Math.random() * 99999);
    let updateId = Math.floor(Math.random() * 1e6);
    const post = (update: object, secret = tg.secret()) =>
      fetch(`${state.baseURL}/api/telegram`, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: ++updateId, ...update }) });
    const say = (words: string, chatId = chat) => post({ message: { message_id: updateId, chat: { id: chatId, type: "private" }, from: { id: chatId, username: "penguji" }, text: words } });
    const sent = (chatId = chat) => tg.calls.filter((c) => c.method === "sendMessage" && c.body.chat_id === String(chatId));
    const sentText = (chatId = chat) => sent(chatId).map((c) => String(c.body.text)).join("\n---\n");
    const buttonsOf = (call: Call) => ((call.body.reply_markup as { inline_keyboard: Button[][] } | undefined)?.inline_keyboard ?? []).flat();
    const tap = (button: Button) =>
      post({ callback_query: { id: `cb${updateId}`, from: { id: chat }, data: button.callback_data, message: { message_id: 1, chat: { id: chat, type: "private" } } } });

    await db`insert into settings (key, value) values ('ai', ${JSON.stringify({ enabled: true, provider: "custom", baseUrl: `http://127.0.0.1:${ai.port}`, model: "mock-model", temperature: 0.2, maxTokens: 2000, thinking: false })}::jsonb)
      on conflict (key) do update set value = excluded.value`;
    await db`update pages set reviewed_at = now() - interval '400 days' where slug = ${SEED_PAGES.old.slug}`;
    try {
      // 1. The admin connects the bot: token checked, webhook registered with a secret.
      await page.goto("/admin/settings#telegram");
      const form = page.getByTestId("telegram-settings");
      await form.getByLabel("Token bot Telegram").fill("123456789:ABCdefghijklmnopqrstuvwxyz0123456789");
      await form.getByRole("button", { name: "Hubungkan bot" }).click();
      await expect(form).toContainText("@docsku_uji_bot");
      const hook = tg.calls.find((c) => c.method === "setWebhook")!;
      expect(String(hook.body.url)).toMatch(/\/api\/telegram$/);
      expect(tg.secret()).toMatch(/^[0-9a-f]{64}$/);
      expect(tg.calls.some((c) => c.method === "setMyCommands")).toBe(true);
      const stored = JSON.stringify((await db`select value from settings where key = 'telegram'`)[0].value);
      expect(stored).not.toContain("ABCdefghijklmnopqrstuvwxyz");

      // Wrong secret: refused. An unlinked chat is told how to link.
      expect((await post({ message: { message_id: 1, chat: { id: chat, type: "private" }, text: "halo" } }, "salah")).status).toBe(401);
      await say("halo");
      await expect.poll(() => sentText()).toContain("belum terhubung");

      // 2. Profil → Telegram: a code, sent as /start, links the chat; the page notices.
      await page.goto("/admin/profile#telegram");
      const linkBox = page.getByTestId("telegram-link");
      await linkBox.getByRole("button", { name: "Hubungkan Telegram" }).click();
      const code = (await page.getByTestId("telegram-code").textContent())!.replace("/start", "").trim();
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
      await say(`/start ${code}`);
      await expect.poll(() => sentText()).toContain("Terhubung sebagai");
      await expect(linkBox).toContainText("Terhubung sebagai @penguji", { timeout: 15_000 });
      // A used code can't link another chat.
      await say(`/start ${code}`, chat + 1);
      await expect.poll(() => sentText(chat + 1)).toContain("tidak valid");

      // 3. A plain message goes to AI Chat; Markdown arrives as Telegram HTML with absolute links.
      await say(`Apa kabar ${id}?`);
      await expect.poll(() => sentText()).toContain(`<b>AI</b> ${id}`);
      expect(sentText()).toMatch(new RegExp(`<a href="http://[^"]+/docs/${SEED_PAGES.intro.slug}">halaman ini</a>`));
      const [conversation] = await db`select id, source from ai_conversations where messages::text like ${`%Apa kabar ${id}%`}`;
      expect(conversation.source).toBe("telegram");

      // 4. A new-page proposal: "Buat draf" creates a draft; a second tap does nothing.
      await say(`Tulis halaman ${id}`);
      await expect.poll(() => sentText()).toContain("Usulan halaman baru");
      const proposalMessage = sent().findLast((c) => String(c.body.text).includes("Usulan halaman baru"))!;
      const draftButton = buttonsOf(proposalMessage).find((b) => b.text.includes("Buat draf"))!;
      await tap(draftButton);
      await expect.poll(async () => (await db`select status from pages where draft_title = ${`Panduan Telegram ${id}`}`).map((r) => r.status)).toEqual(["draft"]);
      await expect.poll(() => sentText()).toContain(`Draf <b>Panduan Telegram ${id}</b> dibuat`);
      await tap(draftButton);
      await expect
        .poll(() => tg.calls.filter((c) => c.method === "answerCallbackQuery").map((c) => String(c.body.text)))
        .toContain("Sudah diproses.");
      expect((await db`select count(*)::int as n from pages where draft_title = ${`Panduan Telegram ${id}`}`)[0].n).toBe(1);

      // 5. An edit for an existing page: applied to its draft only, with a revision.
      await say(`Perbarui lama ${id}`);
      await expect.poll(() => sentText()).toContain("Usulan perubahan");
      const editMessage = sent().findLast((c) => String(c.body.text).includes("Usulan perubahan"))!;
      expect(String(editMessage.body.text)).toContain(SEED_PAGES.old.title);
      await tap(buttonsOf(editMessage).find((b) => b.text.includes("Terapkan ke draf"))!);
      await expect.poll(() => sentText()).toContain("Perubahan diterapkan ke draf");
      const [old] = await db`select id, draft_content::text as draft, content::text as live from pages where slug = ${SEED_PAGES.old.slug}`;
      expect(old.draft).toContain(`Diperbarui dari Telegram ${id}`);
      expect(old.live).not.toContain(`Diperbarui dari Telegram ${id}`);
      expect((await db`select count(*)::int as n from page_revisions where page_id = ${old.id} and reason = 'ai-edit'`)[0].n).toBeGreaterThan(0);

      // 6. Commands.
      await say(`/cari Panduan Telegram ${id}`);
      await expect.poll(() => sentText()).toContain(`Hasil untuk “Panduan Telegram ${id}”`);
      await say("/draf");
      await expect.poll(() => sentText()).toContain("Draf dan perubahan Anda");
      await say("/tinjau");
      await expect.poll(() => sentText()).toContain(SEED_PAGES.old.title);
      await say("/baru");
      await expect.poll(() => sentText()).toContain("Percakapan baru dimulai");

      // 7. A visitor's pending comment: a personal Telegram message with moderation buttons, sent by the scheduler tick.
      const slug = `telegram-komentar-${id}`;
      await createPage(db, state, { slug, title: `Komentar Telegram ${id}` });
      // As an anonymous visitor (page.request would carry the admin's session and post a team comment).
      const res = await fetch(`${state.baseURL}/api/comments`, {
        method: "POST",
        headers: { origin: state.baseURL, "content-type": "application/json", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) e2e" },
        body: JSON.stringify({ slug, name: "Pembaca TG", body: `Tanya ${id} https://contoh.test`, elapsed: 5000 }),
      });
      expect(res.status).toBe(201);
      await expect.poll(async () => (await db`select count(*)::int as n from telegram_outbox where event = 'comment.new' and text like ${`%Tanya ${id}%`}`)[0].n).toBe(1);
      const tick = await fetch(`${state.baseURL}/api/internal/publish-scheduled`, { method: "POST", headers: { authorization: `Bearer ${state.cronSecret}` } });
      expect(tick.ok).toBe(true);
      await expect.poll(() => sentText()).toContain(`Tanya ${id}`);
      const notice = sent().findLast((c) => String(c.body.text).includes(`Tanya ${id}`))!;
      await tap(buttonsOf(notice).find((b) => b.text.includes("Setujui"))!);
      await expect.poll(async () => (await db`select status from page_comments where body like ${`%Tanya ${id}%`}`)[0]?.status).toBe("approved");

      // 8. The chat shows in the web history with its Telegram badge.
      await page.goto(`/admin/ai?c=${conversation.id}`);
      await expect(page.getByText(`Apa kabar ${id}?`)).toBeVisible();
      await expect(page.getByTestId("chat-history-item").filter({ hasText: `Apa kabar ${id}` })).toContainText("Telegram");
    } finally {
      tg.close();
      ai.close();
      await db`delete from settings where key in ('ai', 'telegram')`;
      await db`update pages set draft_content = content where slug = ${SEED_PAGES.old.slug}`;
    }
  });
});
