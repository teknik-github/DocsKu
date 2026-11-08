"use server";

import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { findRedirect, normalisePath } from "@/lib/redirects";
import { can } from "@/lib/auth/permissions";
import { editablePageIds } from "@/lib/auth/page-access";

/**
 * What a link in the editor points at, for the link preview: a /docs page's title
 * and state (published, draft, scheduled, internal), a redirect, or nothing.
 * External links are only described by their host (nothing is fetched).
 */
export type LinkInfo =
  | { kind: "page"; title: string; status: "draft" | "scheduled" | "published"; visibility: "public" | "internal"; anchor: string | null }
  | { kind: "redirect"; to: string }
  | { kind: "missing" }
  /** A page this person may not see (a contributor and someone else's draft or internal page). */
  | { kind: "restricted" }
  | { kind: "external"; host: string }
  | { kind: "other" };

function docSlug(href: string): { slug: string; anchor: string | null } | null {
  let url: URL;
  try {
    url = new URL(href, "http://docsku.local");
  } catch {
    return null;
  }
  if (url.origin !== "http://docsku.local" && !(process.env.SITE_URL && href.startsWith(process.env.SITE_URL))) return null;
  if (!/^\/docs\/.+/.test(url.pathname)) return null;
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* as typed */
  }
  return { slug: path.replace(/^\/docs\//, "").replace(/\/+$/, ""), anchor: url.hash ? url.hash.slice(1) : null };
}

export async function lookupLinks(hrefs: string[]): Promise<Record<string, LinkInfo>> {
  const user = await authorize("any");
  if ("error" in user) return {};
  const list = [...new Set((Array.isArray(hrefs) ? hrefs : []).filter((h): h is string => typeof h === "string" && h.length <= 500))].slice(0, 20);
  const out: Record<string, LinkInfo> = {};
  const wanted = new Map<string, { href: string; anchor: string | null }[]>();
  for (const href of list) {
    if (/^https?:\/\//i.test(href) && !(process.env.SITE_URL && href.startsWith(process.env.SITE_URL))) {
      try {
        out[href] = { kind: "external", host: new URL(href).host };
      } catch {
        out[href] = { kind: "other" };
      }
      continue;
    }
    const target = docSlug(href);
    if (!target) {
      out[href] = { kind: "other" };
      continue;
    }
    wanted.set(target.slug, [...(wanted.get(target.slug) ?? []), { href, anchor: target.anchor }]);
  }
  if (wanted.size) {
    const rows = await db
      .select({ id: schema.pages.id, slug: schema.pages.slug, title: schema.pages.draftTitle, live: schema.pages.title, status: schema.pages.status, visibility: schema.pages.visibility })
      .from(schema.pages)
      .where(inArray(schema.pages.slug, [...wanted.keys()]));
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    // Contributors learn about other people's drafts and internal pages only that they exist.
    const visible = can(user, "pages.editAny") ? null : new Set(await editablePageIds(user, rows.map((row) => row.id)));
    for (const [slug, links] of wanted) {
      const row = bySlug.get(slug);
      for (const { href, anchor } of links) {
        if (row && visible && !visible.has(row.id) && !(row.status === "published" && row.visibility === "public")) {
          out[href] = { kind: "restricted" };
        } else if (row) {
          out[href] = { kind: "page", title: (row.status === "published" ? row.live : row.title) || "Tanpa judul", status: row.status, visibility: row.visibility, anchor };
        } else {
          const redirect = await findRedirect(normalisePath(`/docs/${slug}`)).catch(() => null);
          out[href] = redirect ? { kind: "redirect", to: redirect.url } : { kind: "missing" };
        }
      }
    }
  }
  return out;
}
