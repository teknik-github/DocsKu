"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { forgetRouteExistence } from "@/lib/route-exists";
import { archiveCurrentDocs, VERSION_SLUG } from "@/lib/versions";

/** Documentation versions (/admin/versions): admins only. */

type Result = { ok: true } | { ok: false; error: string };

const archiveSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(VERSION_SLUG, "Alamat versi hanya huruf kecil, angka, titik, atau tanda hubung (mis. 1.0 atau v1)."),
  label: z.string().trim().min(1, "Nama versi wajib diisi.").max(40, "Nama versi maksimal 40 karakter."),
  note: z.string().trim().max(300, "Catatan maksimal 300 karakter.").default(""),
});

/** Archives the live docs as a read-only version. */
export async function archiveVersion(input: { slug: string; label: string; note?: string }): Promise<Result & { pages?: number }> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const result = await archiveCurrentDocs({ ...parsed.data, userId: user.id });
  if (!result.ok) return result;
  updateTag("versions");
  forgetRouteExistence();
  await logActivity({ user, action: "version.create", target: { type: "version", id: parsed.data.slug, label: parsed.data.label }, meta: { pages: result.pages } });
  return { ok: true, pages: result.pages };
}

export async function deleteVersion(id: string): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Versi tidak ditemukan." };
  const [row] = await db.delete(schema.docVersions).where(eq(schema.docVersions.id, id)).returning({ slug: schema.docVersions.slug, label: schema.docVersions.label });
  if (!row) return { ok: false, error: "Versi tidak ditemukan." };
  updateTag("versions");
  forgetRouteExistence();
  await logActivity({ user, action: "version.delete", target: { type: "version", id: row.slug, label: row.label } });
  return { ok: true };
}

/** The name readers see for the live docs in the version picker ("v2", "Terbaru"…). */
export async function saveCurrentVersionLabel(label: string): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = z.string().trim().min(1, "Nama versi wajib diisi.").max(40, "Nama versi maksimal 40 karakter.").safeParse(label);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const value = { currentLabel: parsed.data };
  await db.insert(schema.settings).values({ key: "versions", value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  updateTag("settings");
  await logActivity({ user, action: "version.label", meta: { label: parsed.data } });
  return { ok: true };
}
