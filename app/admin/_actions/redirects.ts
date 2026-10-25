"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { slugSchema } from "@/lib/pages/service";
import { forgetRedirects, normalisePath } from "@/lib/redirects";

type Result = { ok: true } | { ok: false; error: string };

const redirectSchema = z.object({
  from: z.string().max(220),
  to: z.string().trim().min(1, "Isi tujuan.").max(2000),
});

/** "/docs/x", "docs/x" or "x" → "/docs/x"; other site paths and http(s) URLs as they are. */
function normaliseTarget(to: string): string | null {
  if (/^https?:\/\/[^\s/]+\S*$/i.test(to)) return to;
  if (to.startsWith("/") && !to.startsWith("//") && !/\s/.test(to)) {
    return /^\/docs(\/|$)/.test(to) ? `/docs/${normalisePath(to)}`.replace(/\/$/, "") : to;
  }
  const slug = slugSchema.safeParse(normalisePath(to));
  return slug.success ? `/docs/${slug.data}` : null;
}

export async function createRedirect(input: z.input<typeof redirectSchema>): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = redirectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const from = slugSchema.safeParse(normalisePath(parsed.data.from));
  if (!from.success) return { ok: false, error: `Alamat lama: ${from.error.issues[0].message}` };
  const to = normaliseTarget(parsed.data.to);
  if (!to) return { ok: false, error: "Tujuan harus slug halaman, path yang diawali /, atau URL http(s)://." };
  if (to === `/docs/${from.data}`) return { ok: false, error: "Alamat lama dan tujuan sama." };

  const [owner] = await db
    .select({ title: schema.pages.title })
    .from(schema.pages)
    .where(and(eq(schema.pages.slug, from.data), eq(schema.pages.status, "published")));
  if (owner) return { ok: false, error: `Alamat ini dipakai halaman terbit "${owner.title}". Ubah slug halaman itu dulu.` };

  const [created] = await db
    .insert(schema.redirects)
    .values({ fromPath: from.data, toUrl: to })
    .onConflictDoNothing()
    .returning({ id: schema.redirects.id });
  if (!created) return { ok: false, error: "Sudah ada redirect dari alamat ini." };
  forgetRedirects();
  return { ok: true };
}

export async function deleteRedirect(id: string): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Redirect tidak ditemukan." };
  await db.delete(schema.redirects).where(eq(schema.redirects.id, id));
  forgetRedirects();
  return { ok: true };
}
