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

/** contributor: writes drafts and submits them for approval; cannot publish. */
export const roleEnum = pgEnum("role", ["admin", "editor", "contributor"]);
export const pageStatusEnum = pgEnum("page_status", ["draft", "scheduled", "published"]);
export const commentStatusEnum = pgEnum("comment_status", ["pending", "approved", "spam"]);
/** "home" is the single page shown at "/"; everything else lives under /docs. */
export const pageKindEnum = pgEnum("page_kind", ["doc", "home"]);
/** "internal" pages are readable only by signed-in team members and never appear on the public site. */
export const pageVisibilityEnum = pgEnum("page_visibility", ["public", "internal"]);

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
  /** Public author profile: URL slug (/penulis/<slug>), photo (/media/… or https), job title, short bio, and links. */
  username: text("username").unique(),
  avatar: text("avatar"),
  jobTitle: text("job_title"),
  bio: text("bio"),
  links: jsonb("links").$type<{ label: string; url: string }[]>().notNull().default([]),
  /** Which notifications this person receives by email (keys are event names; missing = default). */
  notificationPrefs: jsonb("notification_prefs").$type<Record<string, boolean>>().notNull().default({}),
  /** Two-step login (TOTP): the secret, AES-GCM encrypted with ENCRYPTION_KEY; set only once confirmed. */
  totpSecret: text("totp_secret"),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  /** SHA-256 hashes of the unused one-time recovery codes. */
  recoveryCodes: text("recovery_codes").array().notNull().default(sql`'{}'::text[]`),
  ...timestamps,
});

/**
 * A password-checked login waiting for its second step (TOTP or recovery code).
 * The id is the SHA-256 of a short-lived cookie token; it is never a session.
 */
export const loginChallenges = pgTable(
  "login_challenges",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_challenges_user_idx").on(t.userId)],
);

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
    /** Language of the page (BCP 47 code from the site's language settings, e.g. "id", "en"). */
    locale: text("locale").notNull().default("id"),
    /** For a translation: the page it translates (in the default language). Null for originals. */
    translationOf: uuid("translation_of").references((): AnyPgColumn => pages.id, { onDelete: "set null" }),
    /** Who may read it; applies immediately (not part of the draft). */
    visibility: pageVisibilityEnum("visibility").notNull().default("public"),
    /** Content review: the person responsible, how often (days; null = site default), and when it was last confirmed current. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    reviewIntervalDays: integer("review_interval_days"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Bumped on every save of the working copy; editors send the version they loaded to detect conflicting edits. */
    draftVersion: integer("draft_version").notNull().default(0),
    /** Approval workflow: null (none), "pending" (submitted), "changes_requested". Approving publishes and clears it. */
    approvalStatus: text("approval_status"),
    approvalNote: text("approval_note"),
    approvalRequestedById: uuid("approval_requested_by_id").references(() => users.id, { onDelete: "set null" }),
    approvalRequestedAt: timestamp("approval_requested_at", { withTimezone: true }),
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
    uniqueIndex("pages_translation_locale").on(t.translationOf, t.locale).where(sql`translation_of is not null`),
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
 * Questions visitors asked "Tanya AI" in the search box, per Asia/Jakarta day.
 * `misses` counts answers where the docs had nothing on it. The sum of `asks`
 * for today is also the daily limit's counter, so it survives restarts.
 */
export const askAiQueries = pgTable(
  "ask_ai_queries",
  {
    query: text("query").notNull(),
    day: date("day").notNull(),
    asks: integer("asks").notNull().default(0),
    misses: integer("misses").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.query, t.day] }), index("ask_ai_queries_day_idx").on(t.day)],
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

/** Who did what in the dashboard (and through MCP), newest first at /admin/activity. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** The actor's name at the time, so the entry survives a deleted account. */
    actorName: text("actor_name").notNull(),
    /** Dotted verb, e.g. "page.publish", "user.create", "auth.login_failed". */
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    targetLabel: text("target_label"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_log_created_idx").on(t.createdAt),
    index("activity_log_user_idx").on(t.userId, t.createdAt),
    index("activity_log_target_idx").on(t.targetType, t.targetId),
  ],
);

export type ActivityEntry = typeof activityLog.$inferSelect;

/** Last result of checking a link found in published content (external URLs are fetched on demand). */
export const linkChecks = pgTable("link_checks", {
  url: text("url").primaryKey(),
  ok: boolean("ok").notNull(),
  status: integer("status"),
  error: text("error"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Reusable starting points for new pages ("Halaman baru" → pick a template). Built-in ones live in code (lib/templates.ts). */
export const pageTemplates = pgTable("page_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  /** lucide icon name, optional. */
  icon: text("icon"),
  /** Prefilled title and description for the new page (may be empty). */
  pageTitle: text("page_title").notNull().default(""),
  pageDescription: text("page_description").notNull().default(""),
  content: jsonb("content").$type<JSONContent>().notNull(),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

export type PageTemplate = typeof pageTemplates.$inferSelect;

/** Who has a page open in the editor right now (heartbeat every ~20 s; stale after ~60 s). */
export const pagePresence = pgTable(
  "page_presence",
  {
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** One row per browser tab, so two tabs of the same person are told apart. */
    tabId: text("tab_id").notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.userId, t.tabId] }), index("page_presence_seen_idx").on(t.lastSeen)],
);

/** Emails waiting to be sent (or sent), delivered by the scheduler tick with retries. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    text: text("text").notNull(),
    html: text("html"),
    /** Event that produced it, e.g. "comment.new", "digest.review". */
    event: text("event").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_outbox_due_idx").on(t.status, t.nextAttemptAt)],
);

/** Outgoing webhooks (Slack, Discord, Telegram or a custom URL). The URL/token is AES-GCM encrypted. */
export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** "slack" | "discord" | "telegram" | "custom" */
  kind: text("kind").notNull(),
  /** Encrypted target: the webhook URL, or for Telegram "botToken|chatId". */
  target: text("target").notNull(),
  /** Encrypted signing secret for custom webhooks (HMAC-SHA256 header). */
  secret: text("secret"),
  events: text("events").array().notNull().default(sql`'{}'::text[]`),
  enabled: boolean("enabled").notNull().default(true),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

/** Each attempt to deliver an event to a webhook, retried by the scheduler tick. */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    responseStatus: integer("response_status"),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt), index("webhook_deliveries_hook_idx").on(t.webhookId, t.createdAt)],
);

/**
 * Internal notes on a page in the editor ("cek lagi angka ini"): never public.
 * `quote` is the text that was selected when the note was written; the editor
 * highlights it while it still appears in the working copy. Replies are one level deep.
 */
export const pageNotes = pgTable(
  "page_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => pageNotes.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    quote: text("quote").notNull().default(""),
    body: text("body").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedById: uuid("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("page_notes_page_idx").on(t.pageId, t.createdAt), index("page_notes_parent_idx").on(t.parentId)],
);

export type PageNote = typeof pageNotes.$inferSelect;

/**
 * How far readers got on a published page, per Asia/Jakarta day: one `reads` per
 * finished visit, the depth buckets count visits that reached 25/50/75/100% of
 * the article, and `exits` counts visits that left the site from this page.
 */
export const pageReads = pgTable(
  "page_reads",
  {
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    reads: integer("reads").notNull().default(0),
    depth25: integer("depth_25").notNull().default(0),
    depth50: integer("depth_50").notNull().default(0),
    depth75: integer("depth_75").notNull().default(0),
    depth100: integer("depth_100").notNull().default(0),
    exits: integer("exits").notNull().default(0),
    /** Sum of seconds the page was visible, capped per visit (average = seconds / reads). */
    seconds: integer("seconds").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.day] }), index("page_reads_day_idx").on(t.day)],
);

/** Which article a search led to: query → page, per Asia/Jakarta day. */
export const searchClicks = pgTable(
  "search_clicks",
  {
    query: text("query").notNull(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    clicks: integer("clicks").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.query, t.pageId, t.day] }), index("search_clicks_day_idx").on(t.day)],
);
