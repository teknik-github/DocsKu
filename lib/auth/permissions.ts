import type { Role } from "@/db/schema";

/**
 * Who may do what. One table, used by the server (`authorize`, `requirePermission`
 * in lib/auth/dal.ts, which are the security boundary) and by the dashboard UI to
 * hide what someone can't do. Plain module: safe in client components.
 *
 * - admin: everything.
 * - editor: all content work (publish, approve, moderate, stats, review, templates, import) but not site settings, navigation, users, theme.
 * - contributor: writes and edits their own pages (author or owner), uploads media, uses AI, and submits pages for approval; never publishes.
 */
export type Permission =
  /** Publish, schedule, unpublish, feature, change visibility/author, delete published pages, change a published page's slug. */
  | "pages.publish"
  /** Edit or delete pages that aren't theirs. */
  | "pages.editAny"
  /** Approve a submitted page or ask for changes. */
  | "pages.approve"
  | "pages.import"
  | "templates.manage"
  /** Glossary terms and their tooltips. */
  | "glossary.manage"
  | "home.edit"
  | "comments.moderate"
  | "stats.view"
  | "review.manage"
  /** Site settings, navigation, categories, users, theme, redirects, activity log, export. */
  | "site.admin";

const STAFF: Role[] = ["admin", "editor"];

const RULES: Record<Permission, readonly Role[]> = {
  "pages.publish": STAFF,
  "pages.editAny": STAFF,
  "pages.approve": STAFF,
  "pages.import": STAFF,
  "templates.manage": STAFF,
  "glossary.manage": STAFF,
  "home.edit": STAFF,
  "comments.moderate": STAFF,
  "stats.view": STAFF,
  "review.manage": STAFF,
  "site.admin": ["admin"],
};

export function can(who: Role | { role: Role } | null | undefined, permission: Permission): boolean {
  if (!who) return false;
  const role = typeof who === "string" ? who : who.role;
  return RULES[permission].includes(role);
}

/** Admins and editors: everyone who isn't a contributor. */
export const isStaff = (who: Role | { role: Role } | null | undefined) => can(who, "pages.editAny");

export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", editor: "Editor", contributor: "Kontributor" };

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Semua hal, termasuk pengaturan situs, navigasi, tema, dan pengguna.",
  editor: "Menulis, menyunting, dan menerbitkan semua halaman, menyetujui pengajuan, memoderasi komentar, dan melihat statistik.",
  contributor: "Menulis dan menyunting halamannya sendiri, lalu mengajukannya untuk ditinjau. Tidak bisa menerbitkan.",
};

export const ROLES: Role[] = ["admin", "editor", "contributor"];
