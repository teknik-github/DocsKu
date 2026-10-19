/**
 * Imports the sample pages, navigation, and site settings.
 *
 *   pnpm db:seed           # only if the database has no pages yet
 *   pnpm db:seed --force   # replaces all pages, navigation, and site settings
 *
 * Users are never touched; create the first admin at /admin/setup.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

process.loadEnvFile(".env.local");

const { db, schema } = await import("@/db");
const { frontmatterOf, mdxToDoc } = await import("@/lib/content/mdx-to-doc");
const { seedNavigation, seedSite } = await import("./defaults");
type NavItemData = import("@/lib/site-types").NavItemData;

const force = process.argv.includes("--force");
const DOCS_DIR = path.join(import.meta.dirname, "docs");

async function listMdx(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listMdx(full);
      return Promise.resolve(entry.name.endsWith(".mdx") ? [full] : []);
    }),
  );
  return files.flat();
}

const existing = await db.select({ id: schema.pages.id }).from(schema.pages).limit(1);
if (existing.length && !force) {
  console.log("Database already has pages; nothing to do. Use --force to replace them.");
  process.exit(0);
}

const now = new Date();
const files = await listMdx(DOCS_DIR);
const idBySlug = new Map<string, string>();

await db.transaction(async (tx) => {
  if (force) {
    await tx.delete(schema.pages);
    await tx.delete(schema.settings);
  }

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const slug = path.relative(DOCS_DIR, file).replace(/\\/g, "/").replace(/\.mdx$/, "");
    const meta = frontmatterOf(source);
    const content = mdxToDoc(source);
    const [page] = await tx
      .insert(schema.pages)
      .values({
        slug,
        title: meta.title ?? slug,
        description: meta.description ?? "",
        content,
        draftTitle: meta.title ?? slug,
        draftDescription: meta.description ?? "",
        draftContent: content,
        status: "published",
        publishedAt: now,
      })
      .returning({ id: schema.pages.id });
    await tx.insert(schema.pageRevisions).values({
      pageId: page.id,
      title: meta.title ?? slug,
      description: meta.description ?? "",
      content,
      reason: "import",
    });
    idBySlug.set(slug, page.id);
    console.log(`  imported /docs/${slug}`);
  }

  type SeedItem = (typeof seedNavigation)[number]["sections"][number]["items"][number];
  const toData = (item: SeedItem): NavItemData[] => {
    if ("items" in item) return [{ type: "group", title: item.title, items: item.items.flatMap(toData) }];
    const pageId = item.href.startsWith("/docs/") ? idBySlug.get(item.href.slice(6)) : undefined;
    if (pageId) return [{ type: "page", pageId, title: item.title }];
    return item.href.startsWith("/docs/") ? [] : [{ type: "link", title: item.title, href: item.href }];
  };

  const navigation = {
    tabs: seedNavigation.map((tab) => ({
      id: randomUUID(),
      title: tab.title,
      sections: tab.sections.map((section) => ({
        id: randomUUID(),
        title: section.title,
        items: section.items.flatMap(toData),
      })),
    })),
  };

  await tx
    .insert(schema.settings)
    .values([
      { key: "site", value: seedSite },
      { key: "navigation", value: navigation },
    ])
    .onConflictDoNothing();
});

console.log(`Seeded ${files.length} pages, navigation, and site settings.`);
process.exit(0);
