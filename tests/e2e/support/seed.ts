import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { hashPassword } from "@/lib/auth/password";
import type { E2EState } from "./env";

type Doc = { type: "doc"; content: unknown[] };
const text = (value: string) => ({ type: "text", text: value });
const p = (...parts: unknown[]) => ({ type: "paragraph", content: parts });
const h = (level: 2 | 3, value: string) => ({ type: "heading", attrs: { level }, content: [text(value)] });
const link = (value: string, href: string) => ({ type: "text", text: value, marks: [{ type: "link", attrs: { href } }] });
export const doc = (...content: unknown[]): Doc => ({ type: "doc", content });

/** Pages every spec can rely on. Specs that change content create their own pages. */
export const SEED_PAGES = {
  intro: { slug: "pengenalan", title: "Pengenalan", description: "Kenali situs dokumentasi uji." },
  install: { slug: "panduan/instalasi", title: "Instalasi", description: "Cara memasang aplikasi uji." },
  old: { slug: "panduan/lama", title: "Panduan lama", description: "Halaman yang sudah lama tidak ditinjau." },
  internal: { slug: "tim/rahasia", title: "Catatan tim rahasia", description: "Hanya untuk tim." },
} as const;

const password = () => `e2e-${randomBytes(12).toString("base64url")}`;

/**
 * A small, deterministic site: five accounts (passwords generated per run),
 * one tab with two categories, four pages (one overdue for review, one with a
 * broken link, one internal) and site settings.
 */
export async function seed(sql: postgres.Sql): Promise<E2EState["users"]> {
  const users: E2EState["users"] = {
    admin: { email: "admin@e2e.test", password: password(), name: "Admin Uji" },
    editor: { email: "editor@e2e.test", password: password(), name: "Editor Uji" },
    twofa: { email: "twofa@e2e.test", password: password(), name: "Dua Langkah" },
    strict: { email: "strict@e2e.test", password: password(), name: "Admin Ketat" },
    lockout: { email: "lockout@e2e.test", password: password(), name: "Salah Sandi" },
  };
  const ids: Record<string, string> = {};
  for (const [key, user] of Object.entries(users)) {
    const role = key === "editor" || key === "lockout" ? "editor" : "admin";
    const [row] = await sql`
      insert into users (email, name, password_hash, role, username, job_title, bio)
      values (${user.email}, ${user.name}, ${await hashPassword(user.password)}, ${role}::role,
        ${key === "admin" ? "admin-uji" : null}, ${key === "admin" ? "DevOps Engineer" : null},
        ${key === "admin" ? "Admin Uji adalah seorang DevOps yang menulis panduan uji." : null})
      returning id`;
    ids[key] = row.id;
  }

  const pages: Record<keyof typeof SEED_PAGES, { content: Doc; daysAgo: number; visibility: string }> = {
    intro: {
      content: doc(p(text("Selamat datang di situs uji.")), h(2, "Tentang situs"), p(text("Lanjut ke "), link("instalasi", "/docs/panduan/instalasi"), text("."))),
      daysAgo: 0,
      visibility: "public",
    },
    install: {
      content: doc(
        p(text("Panduan memasang aplikasi.")),
        h(2, "Persyaratan"),
        p(text("Siapkan server.")),
        h(2, "Langkah"),
        p(text("Lihat juga "), link("halaman yang hilang", "/docs/tidak-ada-sama-sekali"), text(".")),
      ),
      daysAgo: 0,
      visibility: "public",
    },
    old: { content: doc(p(text("Isi lama."))), daysAgo: 400, visibility: "public" },
    internal: { content: doc(p(text("Kata sandi Wi-Fi kantor ada di lemari."))), daysAgo: 0, visibility: "internal" },
  };
  const pageIds: Record<string, string> = {};
  for (const [key, meta] of Object.entries(SEED_PAGES)) {
    const page = pages[key as keyof typeof SEED_PAGES];
    const [row] = await sql`
      insert into pages (slug, title, description, content, draft_title, draft_description, draft_content, status, published_at, author_id, visibility)
      values (${meta.slug}, ${meta.title}, ${meta.description}, ${JSON.stringify(page.content)}::jsonb, ${meta.title}, ${meta.description},
        ${JSON.stringify(page.content)}::jsonb, 'published', now() - make_interval(days => ${page.daysAgo}), ${ids.admin}, ${page.visibility}::page_visibility)
      returning id`;
    pageIds[key] = row.id;
  }

  const navigation = {
    tabs: [
      {
        id: "tab-panduan",
        title: "Panduan",
        sections: [
          { id: "sec-mulai", title: "Mulai", items: [{ type: "page", pageId: pageIds.intro }] },
          {
            id: "sec-lanjutan",
            title: "Lanjutan",
            items: [
              { type: "page", pageId: pageIds.install },
              { type: "page", pageId: pageIds.old },
              { type: "page", pageId: pageIds.internal },
            ],
          },
        ],
      },
    ],
  };
  const site = { name: "Docsku E2E", description: "Situs dokumentasi untuk pengujian.", layout: "docs", headerCta: null, resources: [], footer: [] };
  await sql`insert into settings (key, value) values ('navigation', ${JSON.stringify(navigation)}::jsonb), ('site', ${JSON.stringify(site)}::jsonb)`;
  return users;
}
