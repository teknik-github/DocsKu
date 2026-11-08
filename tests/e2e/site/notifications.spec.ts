import http from "node:http";
import net from "node:net";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { ADMIN, EDITOR, createPage, expect, test, uid } from "../support/fixtures";

/**
 * Email (through a throwaway SMTP sink) and a signed custom webhook (to a local
 * receiver; the e2e server runs with WEBHOOK_ALLOW_PRIVATE=1). Nothing leaves
 * this machine.
 */

type Mail = { rcpt: string[]; data: string };
type Hook = { headers: http.IncomingHttpHeaders; body: string };

function smtpSink(): Promise<{ port: number; mails: Mail[]; close: () => void }> {
  const mails: Mail[] = [];
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    let inData = false;
    let rcpt: string[] = [];
    let data = "";
    socket.write("220 sink\r\n");
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          data += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          mails.push({ rcpt, data });
          inData = false;
          rcpt = [];
          data = "";
          socket.write("250 ok\r\n");
          continue;
        }
        const i = buffer.indexOf("\r\n");
        if (i < 0) return;
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") socket.write("250-sink\r\n250 OK\r\n");
        else if (cmd === "RCPT") {
          rcpt.push(line.replace(/^.*<|>.*$/g, ""));
          socket.write("250 ok\r\n");
        } else if (cmd === "DATA") {
          inData = true;
          socket.write("354 go\r\n");
        } else if (cmd === "QUIT") {
          socket.end("221 bye\r\n");
          return;
        } else socket.write("250 ok\r\n");
      }
    });
    socket.on("error", () => {});
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as AddressInfo).port, mails, close: () => server.close() })));
}

function receiver(): Promise<{ port: number; hooks: Hook[]; close: () => void }> {
  const hooks: Hook[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hooks.push({ headers: req.headers, body });
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as AddressInfo).port, hooks, close: () => server.close() })));
}

const decoded = (raw: string) => raw.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

test.describe("notifications", () => {
  test("email settings, a comment email, a signed webhook, and personal preferences", async ({ browser, db, state, page }) => {
    const sink = await smtpSink();
    const hookServer = await receiver();
    const id = uid();
    const slug = `notifikasi-${id}`;
    try {
      const team = await browser.newContext({ storageState: ADMIN });
      const admin = await team.newPage();

      // SMTP settings, then a test email to the admin's own address.
      await admin.goto("/admin/settings#email");
      const email = admin.locator("#email");
      await email.getByLabel("Kirim notifikasi lewat email").check();
      await email.getByLabel("Host SMTP").fill("127.0.0.1");
      await email.getByLabel("Keamanan").selectOption("none");
      await email.getByLabel("Port").fill(String(sink.port));
      await email.getByLabel("Alamat pengirim").fill("docs@contoh.test");
      await email.getByRole("button", { name: "Simpan", exact: true }).click();
      await expect(email.getByText("Pengaturan email disimpan.")).toBeVisible();
      await email.getByRole("button", { name: "Kirim email uji" }).click();
      await expect(email.getByText(/Email uji dikirim ke/)).toBeVisible();
      expect(sink.mails.some((m) => m.rcpt.includes(state.users.admin.email) && /Email uji/.test(m.data))).toBe(true);
      // The password field never echoes anything back.
      expect(await email.getByLabel("Password").inputValue()).toBe("");

      // A custom webhook to the local receiver; the signing secret is shown once.
      await admin.goto("/admin/settings#webhook");
      const hooks = admin.locator("#webhook");
      await hooks.getByRole("button", { name: "Tambah webhook" }).click();
      await hooks.getByLabel("Nama").fill(`Uji ${id}`);
      await hooks.getByLabel("Jenis").selectOption("custom");
      await hooks.getByLabel("URL webhook").fill(`http://127.0.0.1:${hookServer.port}/hook`);
      await hooks.getByLabel("Halaman terbit").uncheck();
      await hooks.getByRole("button", { name: "Simpan webhook" }).click();
      await expect(hooks.getByText("Rahasia penandatangan (hanya ditampilkan sekali)")).toBeVisible();
      const secret = (await hooks.locator("code").first().textContent())!.trim();
      expect(secret).toMatch(/^whsec_/);

      const item = hooks.getByRole("listitem").filter({ hasText: `Uji ${id}` }).first();
      await item.getByRole("button", { name: "Kirim uji" }).click();
      await expect(hooks.getByText(/Uji terkirim ke/)).toBeVisible();
      const sample = hookServer.hooks.at(-1)!;
      expect(sample.headers["x-docsku-event"]).toBe("test");
      expect(sample.headers["x-docsku-signature"]).toBe(`sha256=${createHmac("sha256", secret).update(sample.body).digest("hex")}`);

      // A visitor's comment queues an email and a webhook delivery; the scheduler tick sends both.
      await createPage(db, state, { slug, title: `Halaman notifikasi ${id}` });
      const res = await page.request.post("/api/comments", {
        headers: { origin: state.baseURL },
        data: { slug, name: "Pembaca Notif", body: `Pertanyaan ${id} https://contoh.test`, elapsed: 5000 },
      });
      expect(res.status()).toBe(201);
      const queued = await db`select "to" from email_outbox where event = 'comment.new' and text like ${`%Pertanyaan ${id}%`}`;
      expect(queued.map((r) => r.to)).toContain(state.users.admin.email);

      const tick = await fetch(`${state.baseURL}/api/internal/publish-scheduled`, { method: "POST", headers: { authorization: `Bearer ${state.cronSecret}` } });
      expect(tick.ok).toBe(true);
      await expect.poll(() => sink.mails.filter((m) => decoded(m.data).includes(`Pertanyaan ${id}`)).length).toBeGreaterThan(0);
      const mail = decoded(sink.mails.find((m) => decoded(m.data).includes(`Pertanyaan ${id}`))!.data);
      expect(mail).toMatch(/menunggu persetujuan/);
      expect(mail).toContain("/admin/comments?view=pending");

      await expect.poll(() => hookServer.hooks.filter((h) => h.headers["x-docsku-event"] === "comment.new").length).toBeGreaterThan(0);
      const delivered = hookServer.hooks.find((h) => h.headers["x-docsku-event"] === "comment.new")!;
      expect(delivered.headers["x-docsku-signature"]).toBe(`sha256=${createHmac("sha256", secret).update(delivered.body).digest("hex")}`);
      const body = JSON.parse(delivered.body);
      expect(body).toMatchObject({ event: "comment.new", data: { author: "Pembaca Notif", pending: true } });
      expect(body.data.href).toMatch(new RegExp(`/docs/${slug}#komentar$`));

      await admin.reload();
      await expect(hooks.getByText("Pengiriman terakhir")).toBeVisible();

      // Clean up: delete the webhook, switch email off.
      await item.getByRole("button", { name: `Hapus Uji ${id}` }).click();
      await admin.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click();
      await expect(hooks.getByText("Webhook dihapus.")).toBeVisible();
      await team.close();
      await db`delete from settings where key = 'email'`;

      // An editor turns off comment emails in Profil.
      const editorContext = await browser.newContext({ storageState: EDITOR });
      const editor = await editorContext.newPage();
      await editor.goto("/admin/profile#notifikasi");
      const prefs = editor.locator("#notifikasi");
      await expect(prefs.getByText("Email belum diaktifkan")).toBeVisible();
      await prefs.getByLabel(/Komentar baru/).uncheck();
      await prefs.getByRole("button", { name: "Simpan" }).click();
      await expect(prefs.getByText("Pilihan notifikasi disimpan.")).toBeVisible();
      const [row] = await db`select notification_prefs as prefs from users where email = ${state.users.editor.email}`;
      expect(row.prefs["comment.new"]).toBe(false);
      await editorContext.close();
    } finally {
      sink.close();
      hookServer.close();
    }
  });
});
