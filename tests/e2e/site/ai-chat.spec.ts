import http from "node:http";
import type { AddressInfo } from "node:net";
import { ADMIN, createPage, expect, test, uid } from "../support/fixtures";
import { SEED_PAGES } from "../support/seed";

/**
 * AI Chat against a scripted, local OpenAI-compatible server (provider "custom"):
 * nothing leaves this machine. Covers "@" attachments, the team's writing style
 * in the prompt, audits with an edit for another page, the diff with sections
 * left out, and the history sidebar.
 */

type Body = { messages: { role: string; content: string | null; tool_calls?: { function: { name: string } }[] }[] };

function sse(res: http.ServerResponse, chunks: object[]) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.end("data: [DONE]\n\n");
}
const text = (value: string) => [{ choices: [{ delta: { content: value } }] }, { choices: [{ delta: {}, finish_reason: "stop" }] }];
const toolCall = (name: string, args: object) => [
  { choices: [{ delta: { tool_calls: [{ index: 0, id: `call_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } }] },
  { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
];

function mockAi(): Promise<{ port: number; requests: Body[]; close: () => void }> {
  const requests: Body[] = [];
  const server = http.createServer((req, res) => {
    if (req.method === "GET") return void res.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw) as Body;
      requests.push(body);
      const last = body.messages.at(-1)!;
      if (last.role === "tool") {
        const called = [...body.messages].reverse().find((m) => m.role === "assistant" && m.tool_calls)?.tool_calls?.[0]?.function.name;
        if (called === "audit_pages") {
          return sse(
            res,
            toolCall("propose_page_edit", {
              slug: SEED_PAGES.old.slug,
              content: "## Intro baru\n\nIsi yang diperbarui.\n\n## Bagian tambahan\n\nTeks tambahan yang tidak dipilih.",
              content_mode: "replace",
              note: "Memperbarui halaman lama.",
            }),
          );
        }
        return sse(res, text("Usulan perbaikan sudah saya siapkan."));
      }
      const content = String(last.content ?? "");
      if (content.includes("Audit halaman")) return sse(res, toolCall("audit_pages", { focus: "review_due" }));
      return sse(res, text("Ringkasan halaman sudah siap."));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as AddressInfo).port, requests, close: () => server.close() })));
}

test.describe("AI Chat", () => {
  test.use({ storageState: ADMIN });

  test("attachments, style, audits with a partial edit, and the history sidebar", async ({ page, db }) => {
    const ai = await mockAi();
    const id = uid();
    await db`insert into settings (key, value) values ('ai', ${JSON.stringify({ enabled: true, provider: "custom", baseUrl: `http://127.0.0.1:${ai.port}`, model: "mock-model", temperature: 0.2, maxTokens: 2000, thinking: false })}::jsonb)
      on conflict (key) do update set value = excluded.value`;
    await db`insert into settings (key, value) values ('ai_style', ${JSON.stringify({ voice: "Sapa pembaca dengan Anda", rules: "Nama produk selalu Docsku", avoid: ["gampang"], useGlossary: false })}::jsonb)
      on conflict (key) do update set value = excluded.value`;
    // The review spec may have marked the old page reviewed: make it overdue again for the audit.
    await db`update pages set reviewed_at = now() - interval '400 days' where slug = ${SEED_PAGES.old.slug}`;
    try {
      // 1. "@" attaches a page; the style and the page's content go to the model.
      await page.goto("/admin/ai");
      const box = page.getByLabel("Pesan untuk AI");
      await box.fill("Ringkas ");
      await box.pressSequentially("@pengenal");
      await expect(page.getByTestId("mention-picker")).toContainText(SEED_PAGES.intro.title);
      await box.press("Enter");
      await expect(page.getByTestId("chat-attachments")).toContainText(SEED_PAGES.intro.title);
      await box.pressSequentially(`halaman ini ${id}`);
      await box.press("Enter");
      await expect(page.getByText("Ringkasan halaman sudah siap.")).toBeVisible();
      const first = ai.requests.at(-1)!;
      expect(first.messages[0].content).toContain("Gaya penulisan tim");
      expect(first.messages[0].content).toContain("“gampang”");
      const sent = String(first.messages.at(-1)!.content);
      expect(sent).toContain("[Lampiran");
      expect(sent).toContain("Selamat datang di situs uji.");
      await expect(page.locator(".rounded-md", { hasText: SEED_PAGES.intro.title }).first()).toBeVisible();

      // 2. An audit finds the overdue page and proposes an edit for it; one section is left out.
      await page.getByRole("button", { name: "Percakapan baru" }).first().click();
      await page.getByTestId("audit-starters").getByRole("button", { name: "Halaman yang perlu ditinjau" }).click();
      const card = page.getByTestId("proposal-card");
      await expect(card).toContainText(SEED_PAGES.old.title);
      const auditResult = ai.requests.find((r) => r.messages.at(-1)?.role === "tool");
      expect(String(auditResult?.messages.at(-1)?.content)).toContain(SEED_PAGES.old.slug);
      const diff = card.getByTestId("proposal-diff");
      await expect(diff.locator('[data-diff-section="added"]')).toHaveCount(2);
      await diff.getByLabel("Terapkan perubahan bagian Bagian tambahan").uncheck();
      await card.getByRole("button", { name: "Terapkan bagian terpilih" }).click();
      await expect(card).toContainText("Diterapkan ke draf halaman itu");
      const [old] = await db`select id, draft_content::text as draft, content::text as live from pages where slug = ${SEED_PAGES.old.slug}`;
      expect(old.draft).toContain("Intro baru");
      expect(old.draft).not.toContain("Teks tambahan yang tidak dipilih");
      expect(old.live).not.toContain("Intro baru");
      expect((await db`select count(*)::int as n from page_revisions where page_id = ${old.id} and reason = 'ai-edit'`)[0].n).toBe(1);

      // 3. History: search, pin, rename.
      const history = page.getByTestId("chat-history");
      await expect(history.getByTestId("chat-history-item")).toHaveCount(2);
      await history.getByLabel("Cari percakapan").fill(id);
      await expect(history.getByTestId("chat-history-item")).toHaveCount(1);
      const item = history.getByTestId("chat-history-item").first();
      await item.hover();
      await item.getByRole("button", { name: /Tindakan untuk/ }).click();
      await item.getByRole("button", { name: /^Sematkan/ }).click();
      await expect(history.getByRole("heading", { name: "Disematkan" })).toBeVisible();
      await item.hover();
      await item.getByRole("button", { name: /Tindakan untuk/ }).click();
      await item.getByRole("button", { name: /^Ganti nama/ }).click();
      await history.getByLabel("Nama percakapan").fill(`Ringkasan ${id}`);
      await history.getByLabel("Nama percakapan").press("Enter");
      await expect(history.getByTestId("chat-history-item").first()).toContainText(`Ringkasan ${id}`);
      expect((await db`select pinned from ai_conversations where title = ${`Ringkasan ${id}`}`)[0]?.pinned).toBe(true);
    } finally {
      ai.close();
      await db`delete from settings where key in ('ai', 'ai_style')`;
      await db`update pages set draft_content = content where slug = ${SEED_PAGES.old.slug}`;
    }
  });

  test("avoided words from the writing style are flagged in the editor", async ({ page, db, state }) => {
    const id = uid();
    await db`insert into settings (key, value) values ('ai_style', ${JSON.stringify({ voice: "", rules: "", avoid: ["gampang"], useGlossary: true })}::jsonb)
      on conflict (key) do update set value = excluded.value`;
    try {
      const pageId = await createPage(db, state, { slug: `gaya-${id}`, title: `Gaya ${id}`, status: "draft", body: "Caranya gampang sekali." });
      await page.goto(`/admin/pages/${pageId}`);
      await page.getByRole("button", { name: /Periksa/ }).click();
      await expect(page.getByTestId("quality-tab")).toContainText("Memakai kata yang dihindari tim: “gampang”.");
    } finally {
      await db`delete from settings where key = 'ai_style'`;
    }
  });
});
