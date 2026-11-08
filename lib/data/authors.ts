import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { buildingWithoutDatabase, db, schema } from "@/db";
import type { PublicAuthor } from "@/lib/authors";
import { slugToHref } from "@/lib/navigation";

/**
 * Public author data, cached under "authors" (profile and page-author changes
 * call `updateTag("authors")`) and "pages" (which pages count as theirs).
 * A page's author is `coalesce(author_id, updated_by_id)`.
 */

const columns = {
  id: schema.users.id,
  name: schema.users.name,
  username: schema.users.username,
  avatar: schema.users.avatar,
  jobTitle: schema.users.jobTitle,
  bio: schema.users.bio,
  links: schema.users.links,
};

const pageAuthor = sql`coalesce(${schema.pages.authorId}, ${schema.pages.updatedById})`;
const publicPage = and(eq(schema.pages.status, "published"), eq(schema.pages.kind, "doc"), eq(schema.pages.visibility, "public"));

/** An author by id (for an article's byline and author box), or null. */
export async function getAuthor(id: string | null | undefined): Promise<PublicAuthor | null> {
  "use cache";
  cacheTag("authors");
  cacheLife("max");
  if (!id || buildingWithoutDatabase) return null;
  const [row] = await db.select(columns).from(schema.users).where(eq(schema.users.id, id));
  return row ?? null;
}

/** Usernames of authors with at least one published public page: their /penulis pages exist. */
export async function getAuthorUsernames(): Promise<string[]> {
  "use cache";
  cacheTag("authors", "pages");
  cacheLife("max");
  if (buildingWithoutDatabase) return [];
  const rows = await db
    .selectDistinct({ username: schema.users.username })
    .from(schema.users)
    .innerJoin(schema.pages, sql`${pageAuthor} = ${schema.users.id}`)
    .where(and(isNotNull(schema.users.username), publicPage));
  return rows.flatMap((row) => (row.username ? [row.username] : []));
}

/**
 * An author page: the profile and their published public articles (originals
 * and translations), newest first. Null when the username is unknown or they
 * have nothing public.
 */
export async function getAuthorPage(username: string): Promise<{ author: PublicAuthor; pages: { href: string; locale: string; publishedAt: string | null }[] } | null> {
  "use cache";
  cacheTag("authors", "pages");
  cacheLife("max");
  if (buildingWithoutDatabase) return null;
  const [author] = await db.select(columns).from(schema.users).where(eq(schema.users.username, username));
  if (!author) return null;
  const rows = await db
    .select({ slug: schema.pages.slug, locale: schema.pages.locale, publishedAt: schema.pages.publishedAt })
    .from(schema.pages)
    .where(and(publicPage, sql`${pageAuthor} = ${author.id}`))
    .orderBy(desc(schema.pages.publishedAt));
  if (!rows.length) return null;
  return { author, pages: rows.map((row) => ({ href: slugToHref(row.slug), locale: row.locale, publishedAt: row.publishedAt?.toISOString() ?? null })) };
}
