import path from "node:path";
import { createHmac } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { STATE_DIR, readState, type Account, type E2EState } from "./env";

export { expect };

/** Session files written by global-setup.ts. */
export const ADMIN = path.join(STATE_DIR, "admin.json");
export const EDITOR = path.join(STATE_DIR, "editor.json");

type Fixtures = {
  state: E2EState;
  /** Fails the test when the page throws or logs a console error (resource 404s excepted). */
  pageErrors: string[];
};
type WorkerFixtures = { db: postgres.Sql };

export const test = base.extend<Fixtures, WorkerFixtures>({
  state: async ({}, use) => use(readState()),
  db: [
    async ({}, use) => {
      const sql = postgres(readState().databaseUrl, { max: 2, onnotice: () => {} });
      await use(sql);
      await sql.end();
    },
    { scope: "worker" },
  ],
  pageErrors: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (/Failed to load resource|status of 404|net::ERR_ABORTED/.test(text)) return;
        errors.push(`console: ${text}`);
      });
      await use(errors);
      if (!testInfo.annotations.some((a) => a.type === "allow-console-errors")) {
        expect(errors, "page errors / console errors").toEqual([]);
      }
    },
    { auto: true },
  ],
});

/** Expires every cache tag on the test server, after writing to the database directly. */
export async function refreshCache(state: E2EState) {
  const res = await fetch(`${state.baseURL}/api/internal/refresh`, { method: "POST", headers: { authorization: `Bearer ${state.cronSecret}` } });
  expect(res.ok, "cache refresh").toBe(true);
}

export async function login(page: Page, account: Account) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
}

/** RFC 6238 code for a base32 secret (what an authenticator app shows). */
export function totp(secret: string, offsetSteps = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const hmac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** A unique, recognisable suffix for things a test creates. */
export const uid = () => Math.random().toString(36).slice(2, 8);

/** Width the page scrolls beyond the viewport (0 = no horizontal overflow). */
export const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Creates a published (or draft) doc page directly in the test database and refreshes the cache. */
export async function createPage(
  db: postgres.Sql,
  state: E2EState,
  input: { slug: string; title: string; body?: string; status?: "draft" | "published"; visibility?: "public" | "internal"; authorEmail?: string; locale?: string; translationOf?: string },
) {
  const content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: input.body ?? `Isi ${input.title}.` }] }, { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Bagian satu" }] }, { type: "paragraph", content: [{ type: "text", text: "Teks bagian satu." }] }] };
  const status = input.status ?? "published";
  const [row] = await db`
    insert into pages (slug, title, description, content, draft_title, draft_description, draft_content, status, published_at, author_id, visibility, locale, translation_of)
    values (${input.slug}, ${input.title}, '', ${JSON.stringify(content)}::jsonb, ${input.title}, '', ${JSON.stringify(content)}::jsonb, ${status}::page_status,
      ${status === "published" ? db`now()` : null},
      (select id from users where email = ${input.authorEmail ?? state.users.admin.email}),
      ${input.visibility ?? "public"}::page_visibility, ${input.locale ?? "id"}, ${input.translationOf ?? null})
    returning id`;
  await refreshCache(state);
  return row.id as string;
}
