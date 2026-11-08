"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { listTemplateChoices, type TemplateChoice } from "@/lib/templates";
import { TEMPLATE_ICON_NAMES } from "@/lib/template-icon-names";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Page templates. Editors and admins can use and save them; a custom template
 * can be changed or deleted by the person who saved it, or by an admin.
 */

/** For the "Halaman baru" picker: built-in templates first, then the team's. */
export async function getTemplateChoices(): Promise<{ ok: true; templates: TemplateChoice[]; userId: string; admin: boolean } | { ok: false; error: string }> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  return { ok: true, templates: await listTemplateChoices(), userId: user.id, admin: user.role === "admin" };
}

const metaSchema = z.object({
  name: z.string().trim().min(1, "Nama templat wajib diisi.").max(80, "Nama templat maksimal 80 karakter."),
  description: z.string().trim().max(200, "Deskripsi maksimal 200 karakter.").default(""),
  icon: z.enum(TEMPLATE_ICON_NAMES).default("file-text"),
});

/** Saves a page's working copy as a template (the editor saves the page first). */
export async function saveAsTemplate(input: { pageId: string; name: string; description?: string; icon?: string; includeTitle?: boolean }): Promise<Result & { id?: string }> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!z.uuid().safeParse(input.pageId).success) return { ok: false, error: "Halaman tidak ditemukan." };
  const [page] = await db
    .select({ title: schema.pages.draftTitle, description: schema.pages.draftDescription, content: schema.pages.draftContent })
    .from(schema.pages)
    .where(eq(schema.pages.id, input.pageId));
  if (!page) return { ok: false, error: "Halaman tidak ditemukan." };
  const [row] = await db
    .insert(schema.pageTemplates)
    .values({
      name: parsed.data.name,
      description: parsed.data.description,
      icon: parsed.data.icon,
      pageTitle: input.includeTitle ? page.title : "",
      pageDescription: input.includeTitle ? page.description : "",
      content: page.content,
      createdById: user.id,
    })
    .returning({ id: schema.pageTemplates.id });
  await logActivity({ user, action: "template.create", target: { type: "template", id: row.id, label: parsed.data.name }, meta: { pageId: input.pageId } });
  return { ok: true, id: row.id };
}

async function ownTemplate(id: string, user: { id: string; role: string }) {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db
    .select({ id: schema.pageTemplates.id, name: schema.pageTemplates.name, createdById: schema.pageTemplates.createdById })
    .from(schema.pageTemplates)
    .where(eq(schema.pageTemplates.id, id));
  if (!row) return null;
  return user.role === "admin" || row.createdById === user.id ? row : "forbidden";
}

export async function updateTemplate(id: string, input: { name: string; description?: string; icon?: string }): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const row = await ownTemplate(id, user);
  if (!row) return { ok: false, error: "Templat tidak ditemukan." };
  if (row === "forbidden") return { ok: false, error: "Hanya pembuat templat atau admin yang bisa mengubahnya." };
  const parsed = metaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db.update(schema.pageTemplates).set(parsed.data).where(eq(schema.pageTemplates.id, id));
  await logActivity({ user, action: "template.update", target: { type: "template", id, label: parsed.data.name }, meta: row.name !== parsed.data.name ? { from: row.name } : undefined });
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const row = await ownTemplate(id, user);
  if (!row) return { ok: false, error: "Templat tidak ditemukan." };
  if (row === "forbidden") return { ok: false, error: "Hanya pembuat templat atau admin yang bisa menghapusnya." };
  await db.delete(schema.pageTemplates).where(eq(schema.pageTemplates.id, id));
  await logActivity({ user, action: "template.delete", target: { type: "template", id, label: row.name } });
  return { ok: true };
}
