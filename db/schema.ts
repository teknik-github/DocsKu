import type { JSONContent } from "@tiptap/core";
import { sql } from "drizzle-orm";
import type { PageSeo } from "@/lib/site-types";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "editor"]);
export const pageStatusEnum = pgEnum("page_status", ["draft", "scheduled", "published"]);
export const commentStatusEnum = pgEnum("comment_status", ["pending", "approved", "spam"]);
/** "home" is the single page shown at "/"; everything else lives under /docs. */
export const pageKindEnum = pgEnum("page_kind", ["doc", "home"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("editor"),
  ...timestamps,
});

/** Session id is the SHA-256 of the cookie token, so a DB leak can't be replayed. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: pageKindEnum("kind").notNull().default("doc"),
    /** Path under /docs, e.g. "menulis/komponen". The home page uses "_home". */
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /**
     * Two copies of the page: the live version (title/description/content),
     * which visitors see once published, and the working copy (draft*), which
     * the editor autosaves. Publishing copies the working copy to the live one.
     */
    content: jsonb("content").$type<JSONContent>().notNull(),
    draftTitle: text("draft_title").notNull(),
    draftDescription: text("draft_description").notNull().default(""),
    draftContent: jsonb("draft_content").$type<JSONContent>().notNull(),
    /** Cover image (URL), live and working copy; shown on cards and articles in the "publication" layout. */
    coverImage: text("cover_image"),
    draftCoverImage: text("draft_cover_image"),
    /** Search/social metadata, live and working copy, like the fields above. */
    seo: jsonb("seo").$type<PageSeo>().notNull().default({}),
    draftSeo: jsonb("draft_seo").$type<PageSeo>().notNull().default({}),
    /** Shown first and labelled "Unggulan" in the Ghost-style layout. Applies immediately. */
    featured: boolean("featured").notNull().default(false),
    /**
     * Where the first publish adds the page in the navigation: a section id,
     * "none" to leave it out, or null to let AI (or the first section) decide.
     */
    navSection: text("nav_section"),
    /** Working copy differs from what is live. */
    hasChanges: boolean("has_changes").notNull().default(false),
    status: pageStatusEnum("status").notNull().default("draft"),
    /** When the page went (or goes, if scheduled) live. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("pages_status_idx").on(t.status, t.publishedAt),
    uniqueIndex("pages_one_home").on(t.kind).where(sql`kind = 'home'`),
  ],
);

export const pageRevisions = pgTable(
  "page_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    content: jsonb("content").$type<JSONContent>().notNull(),
    seo: jsonb("seo").$type<PageSeo>().notNull().default({}),
    coverImage: text("cover_image"),
    /** What produced this snapshot: a manual save, a publish, or a restore. */
    reason: text("reason").notNull(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("page_revisions_page_idx").on(t.pageId, t.createdAt)],
);

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Name of the stored file in UPLOAD_DIR. */
  filename: text("filename").notNull().unique(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Small JSON documents keyed by name: "site", "navigation". */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type User = typeof users.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type Page = typeof pages.$inferSelect;
export type PageStatus = (typeof pageStatusEnum.enumValues)[number];
export type PageKind = (typeof pageKindEnum.enumValues)[number];
export type PageRevision = typeof pageRevisions.$inferSelect;
export type Media = typeof media.$inferSelect;

/** AI Chat conversations, private to each user. */
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Set for chats started from the editor panel of a page. */
    pageId: uuid("page_id").references(() => pages.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    /** Model override for this chat; null uses the model from Settings. */
    model: text("model"),
    /** Full transcript shown in the UI (ChatMessage[] in lib/ai/chat-types.ts). */
    messages: jsonb("messages").$type<unknown[]>().notNull().default([]),
    /** Auto-compaction: a summary standing in for the first `compactedCount` messages. */
    summary: text("summary"),
    compactedCount: integer("compacted_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("ai_conversations_user_idx").on(t.userId, t.updatedAt)],
);

export type AiConversation = typeof aiConversations.$inferSelect;

/**
 * Personal API tokens for the MCP endpoint (/api/mcp). Only the SHA-256 of the
 * token is stored; `prefix` is shown in the dashboard to tell tokens apart.
 * A token never has more rights than its user: scopes narrow what the user may do.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    /** Subset of "read", "write", "publish" (lib/mcp/scopes.ts). */
    scopes: text("scopes").array().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
);

export type ApiToken = typeof apiTokens.$inferSelect;

/**
 * Redirects for /docs paths (`fromPath` is the slug without "/docs/"). Automatic
 * ones are recorded when a published page's slug changes and point at the page,
 * so they always follow its current slug; manual ones point at `toUrl`.
 * Served by proxy.ts (lib/redirects.ts) only when no published page owns the path.
 */
export const redirects = pgTable("redirects", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromPath: text("from_path").notNull().unique(),
  pageId: uuid("page_id").references(() => pages.id, { onDelete: "cascade" }),
  /** A site path ("/docs/…") or an absolute http(s) URL, for manual redirects. */
  toUrl: text("to_url"),
  auto: boolean("auto").notNull().default(false),
  hits: integer("hits").notNull().default(0),
  lastHitAt: timestamp("last_hit_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Redirect = typeof redirects.$inferSelect;

/** Views per published page per day (Asia/Jakarta date), counted without cookies. */
export const pageViews = pgTable(
  "page_views",
  {
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.day] }), index("page_views_day_idx").on(t.day)],
);

/** "Was this page helpful?" answers from readers, with an optional message seen only in the dashboard. */
export const pageFeedback = pgTable(
  "page_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    helpful: boolean("helpful").notNull(),
    comment: text("comment"),
    /** Marked done by an editor in the dashboard. */
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("page_feedback_page_idx").on(t.pageId, t.createdAt), index("page_feedback_created_idx").on(t.createdAt)],
);

export type PageFeedback = typeof pageFeedback.$inferSelect;

/** Site search queries per day (normalised, lower-case), and how many found nothing. */
export const searchQueries = pgTable(
  "search_queries",
  {
    query: text("query").notNull(),
    day: date("day").notNull(),
    searches: integer("searches").notNull().default(0),
    misses: integer("misses").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.query, t.day] }), index("search_queries_day_idx").on(t.day)],
);

/**
 * Public comments under published doc pages. Visitors' comments wait for
 * approval only when manual moderation is on; replies are one level deep. The email is
 * only ever shown in the dashboard.
 */
export const pageComments = pgTable(
  "page_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => pageComments.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email"),
    body: text("body").notNull(),
    status: commentStatusEnum("status").notNull().default("pending"),
    /** Written from the dashboard by a signed-in user (shown with a "Tim" badge). */
    isStaff: boolean("is_staff").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [
    index("page_comments_page_idx").on(t.pageId, t.status, t.createdAt),
    index("page_comments_status_idx").on(t.status, t.createdAt),
    index("page_comments_parent_idx").on(t.parentId),
  ],
);

export type PageComment = typeof pageComments.$inferSelect;
