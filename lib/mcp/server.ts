import "server-only";
import type { JSONContent } from "@tiptap/core";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { COMPONENTS } from "@/lib/ai/agent";
import { placementOf } from "@/lib/automation";
import { mdxToDoc } from "@/lib/content/mdx-to-doc";
import { toMarkdown } from "@/lib/content/markdown";
import type { McpScope } from "@/lib/mcp/scopes";
import type { TokenPrincipal } from "@/lib/mcp/tokens";
import {
  createPageFromMarkdown,
  draftSchema,
  markdownPageSchema,
  publishWorkingCopy,
  saveWorkingCopy,
  unpublish,
  type Invalidate,
} from "@/lib/pages/service";
import type { NavigationData, NavItemData } from "@/lib/site-types";

/**
 * Docsku as an MCP server (served at /api/mcp). A fresh instance is built per
 * request for the token's user, with only the tools its scopes allow, so a
 * client never even sees tools it may not call.
 */

const json = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const fail = (message: string): CallToolResult => ({ content: [{ type: "text", text: message }], isError: true });

const pageRef = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe('Slug halaman (mis. "menulis/komponen", boleh diawali /docs/) atau id-nya.');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A doc page by id or slug; the home page is not editable over MCP. */
async function findPage(ref: string) {
  const slug = ref.replace(/^\/?docs\//, "").replace(/^\/+|\/+$/g, "");
  const [page] = await db
    .select()
    .from(schema.pages)
    .where(and(eq(schema.pages.kind, "doc"), UUID.test(ref) ? eq(schema.pages.id, ref) : eq(schema.pages.slug, slug)));
  return page ?? null;
}

async function readNavigation(): Promise<NavigationData> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "navigation"));
  return (row?.value as NavigationData | undefined) ?? { tabs: [] };
}

export function createDocskuServer({ principal, baseUrl, invalidate }: { principal: TokenPrincipal; baseUrl: string; invalidate: Invalidate }) {
  const can = (scope: McpScope) => principal.scopes.includes(scope);
  const urls = (page: { id: string; slug: string }) => ({
    url: `${baseUrl}/docs/${page.slug}`,
    editor: `${baseUrl}/admin/pages/${page.id}`,
  });

  const server = new McpServer(
    { name: "docsku", version: "1.0.0" },
    {
      instructions: `Docsku adalah situs dokumentasi. Isi halaman ditulis dalam Markdown: mulai dari judul ## (judul halaman terpisah), paragraf, daftar, tabel, dan blok kode dengan bahasa. Halaman punya salinan kerja (draf) dan versi terbit; mengubah draf tidak mengubah situs sampai diterbitkan.
Token ini milik ${principal.name} dengan izin: ${principal.scopes.join(", ")}.

${COMPONENTS}`,
    },
  );

  if (can("read")) {
    server.registerTool(
      "search_pages",
      {
        title: "Cari halaman",
        description: "Cari halaman dokumentasi berdasarkan judul, slug, atau deskripsi (draf dan yang sudah terbit).",
        inputSchema: z.object({ query: z.string().trim().min(1).max(100), limit: z.number().int().min(1).max(50).default(10) }),
        annotations: { readOnlyHint: true },
      },
      async ({ query, limit }) => {
        const term = `%${query.replace(/[%_\\]/g, "\\$&")}%`;
        const rows = await db
          .select({ id: schema.pages.id, slug: schema.pages.slug, title: schema.pages.draftTitle, description: schema.pages.draftDescription, status: schema.pages.status })
          .from(schema.pages)
          .where(
            and(
              eq(schema.pages.kind, "doc"),
              or(ilike(schema.pages.draftTitle, term), ilike(schema.pages.slug, term), ilike(schema.pages.draftDescription, term)),
            ),
          )
          .orderBy(asc(schema.pages.slug))
          .limit(limit);
        return json(rows.map((row) => ({ ...row, ...urls(row) })));
      },
    );

    server.registerTool(
      "list_pages",
      {
        title: "Daftar halaman",
        description: "Daftar halaman dokumentasi, yang terakhir diubah lebih dulu. Bisa difilter per status.",
        inputSchema: z.object({
          status: z.enum(["draft", "scheduled", "published"]).optional(),
          limit: z.number().int().min(1).max(100).default(50),
          offset: z.number().int().min(0).default(0),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ status, limit, offset }) => {
        const filters: SQL[] = [eq(schema.pages.kind, "doc")];
        if (status) filters.push(eq(schema.pages.status, status));
        const rows = await db
          .select({
            id: schema.pages.id,
            slug: schema.pages.slug,
            title: schema.pages.draftTitle,
            status: schema.pages.status,
            hasUnpublishedChanges: schema.pages.hasChanges,
            publishedAt: schema.pages.publishedAt,
            updatedAt: schema.pages.updatedAt,
          })
          .from(schema.pages)
          .where(and(...filters))
          .orderBy(desc(schema.pages.updatedAt))
          .limit(limit)
          .offset(offset);
        return json(rows.map((row) => ({ ...row, ...urls(row) })));
      },
    );

    server.registerTool(
      "read_page",
      {
        title: "Baca halaman",
        description: "Isi lengkap sebuah halaman sebagai Markdown, beserta status, SEO, dan letaknya di navigasi.",
        inputSchema: z.object({
          page: pageRef,
          version: z.enum(["draft", "live"]).default("draft").describe("draft = salinan kerja terbaru, live = yang tampil di situs."),
        }),
        annotations: { readOnlyHint: true },
      },
      async ({ page: ref, version }) => {
        const page = await findPage(ref);
        if (!page) return fail(`Halaman "${ref}" tidak ditemukan.`);
        if (version === "live" && page.status !== "published") return fail("Halaman ini belum terbit; baca versi draft.");
        const live = version === "live";
        return json({
          id: page.id,
          slug: page.slug,
          status: page.status,
          hasUnpublishedChanges: page.hasChanges,
          publishedAt: page.publishedAt,
          navigation: placementOf(await readNavigation(), page.id),
          title: live ? page.title : page.draftTitle,
          description: live ? page.description : page.draftDescription,
          seo: live ? page.seo : page.draftSeo,
          cover: live ? page.coverImage : page.draftCoverImage,
          markdown: toMarkdown(live ? page.content : page.draftContent),
          ...urls(page),
        });
      },
    );

    server.registerTool(
      "get_site_structure",
      {
        title: "Struktur situs",
        description: "Tab, bagian, dan halaman di navigasi situs, dengan slug dan status tiap halaman.",
        annotations: { readOnlyHint: true },
      },
      async () => {
        const [navigation, pages] = await Promise.all([
          readNavigation(),
          db
            .select({ id: schema.pages.id, slug: schema.pages.slug, title: schema.pages.draftTitle, status: schema.pages.status })
            .from(schema.pages)
            .where(eq(schema.pages.kind, "doc")),
        ]);
        const byId = new Map(pages.map((page) => [page.id, page]));
        const items = (list: NavItemData[]): unknown[] =>
          list.map((item) => {
            if (item.type === "link") return { link: item.title, href: item.href };
            if (item.type === "group") return { group: item.title, items: items(item.items) };
            const page = byId.get(item.pageId);
            return page ? { title: item.title || page.title, slug: page.slug, status: page.status } : { missingPage: item.pageId };
          });
        const listed = new Set<string>();
        const collect = (list: NavItemData[]) =>
          list.forEach((item) => (item.type === "page" ? listed.add(item.pageId) : item.type === "group" && collect(item.items)));
        navigation.tabs.forEach((tab) => tab.sections.forEach((section) => collect(section.items)));
        return json({
          tabs: navigation.tabs.map((tab) => ({
            tab: tab.title,
            sections: tab.sections.map((section) => ({ section: `${tab.title} › ${section.title}`, items: items(section.items) })),
          })),
          notInNavigation: pages.filter((page) => !listed.has(page.id)).map(({ slug, title, status }) => ({ slug, title, status })),
        });
      },
    );
  }

  if (can("write")) {
    server.registerTool(
      "create_draft",
      {
        title: "Buat draf halaman",
        description:
          'Membuat halaman baru sebagai draf (belum terbit). Isi dalam Markdown. "section" ("Tab › Section" dari get_site_structure) menentukan letaknya di navigasi saat pertama terbit.',
        inputSchema: markdownPageSchema,
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      },
      async (input) => {
        const page = await createPageFromMarkdown(input, principal.userId, "mcp");
        return json({ id: page.id, slug: page.slug, status: "draft", ...urls(page) });
      },
    );

    server.registerTool(
      "update_draft",
      {
        title: "Ubah draf halaman",
        description:
          "Mengubah salinan kerja halaman. Hanya field yang diisi yang berubah. Situs tidak berubah sampai halaman diterbitkan; revisi disimpan sehingga bisa dipulihkan.",
        inputSchema: z.object({
          page: pageRef,
          title: z.string().trim().min(1).max(200).optional(),
          description: z.string().trim().max(500).optional(),
          content: z.string().max(60_000).optional().describe("Isi baru dalam Markdown."),
          content_mode: z.enum(["replace", "append"]).default("replace").describe("replace = ganti seluruh isi, append = tambahkan di akhir."),
          seo: z.object({ title: z.string().trim().max(120).optional(), description: z.string().trim().max(320).optional() }).optional(),
        }),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      },
      async ({ page: ref, title, description, content, content_mode, seo }) => {
        const page = await findPage(ref);
        if (!page) return fail(`Halaman "${ref}" tidak ditemukan.`);
        let doc: JSONContent = page.draftContent;
        if (content !== undefined) {
          const added = mdxToDoc(content);
          doc = content_mode === "append" ? { type: "doc", content: [...(page.draftContent.content ?? []), ...(added.content ?? [])] } : added;
        }
        const parsed = draftSchema.safeParse({
          title: title ?? page.draftTitle,
          description: description ?? page.draftDescription,
          content: doc,
          seo: { ...page.draftSeo, ...seo },
          cover: page.draftCoverImage,
        });
        if (!parsed.success) return fail(parsed.error.issues[0].message);
        const saved = await saveWorkingCopy(page.id, parsed.data, principal.userId, "mcp");
        if (!saved.ok) return fail(saved.error);
        return json({ id: page.id, slug: page.slug, status: page.status, hasUnpublishedChanges: saved.hasChanges, ...urls(page) });
      },
    );
  }

  if (can("publish")) {
    server.registerTool(
      "publish_page",
      {
        title: "Terbitkan halaman",
        description:
          "Menerbitkan salinan kerja halaman sekarang, atau menjadwalkannya bila publish_at di masa depan. Otomatisasi situs (navigasi, slug, deskripsi, SEO) ikut berjalan.",
        inputSchema: z.object({
          page: pageRef,
          publish_at: z.string().trim().max(40).optional().describe("Waktu terbit ISO 8601 dengan zona waktu, mis. 2026-11-03T09:00:00+07:00."),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async ({ page: ref, publish_at }) => {
        const page = await findPage(ref);
        if (!page) return fail(`Halaman "${ref}" tidak ditemukan.`);
        const draft = draftSchema.safeParse({
          title: page.draftTitle,
          description: page.draftDescription,
          content: page.draftContent,
          seo: page.draftSeo,
          cover: page.draftCoverImage,
        });
        if (!draft.success) return fail(draft.error.issues[0].message);
        const result = await publishWorkingCopy(page.id, draft.data, publish_at ?? null, principal.userId, invalidate);
        if (!result.ok) return fail(result.error);
        return json({ id: page.id, status: result.status, publishedAt: result.publishedAt, automation: result.filled, ...urls({ id: page.id, slug: result.slug }) });
      },
    );

    server.registerTool(
      "unpublish_page",
      {
        title: "Tarik halaman dari situs",
        description: "Mengembalikan halaman ke draf (atau membatalkan jadwal). Isi tetap tersimpan.",
        inputSchema: z.object({ page: pageRef }),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      async ({ page: ref }) => {
        const page = await findPage(ref);
        if (!page) return fail(`Halaman "${ref}" tidak ditemukan.`);
        const result = await unpublish(page.id, principal.userId, invalidate);
        if (!result.ok) return fail(result.error);
        return json({ id: page.id, slug: page.slug, status: "draft" });
      },
    );
  }

  return server;
}
