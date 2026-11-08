"use server";

import { updateTag } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { syncTranslationVisibility } from "@/lib/translations";

type Result = { ok: true; count: number } | { ok: false; error: string };

const inputSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  visibility: z.enum(["public", "internal"]),
});

/**
 * Makes doc pages internal (signed-in team only, off the public site) or
 * public again. Applies immediately, like "featured"; editors and admins.
 */
export async function setPagesVisibility(ids: string[], visibility: "public" | "internal"): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = inputSchema.safeParse({ ids, visibility });
  if (!parsed.success) return { ok: false, error: "Pilihan tidak valid." };

  const pages = schema.pages;
  const changed = await db
    .update(pages)
    .set({ visibility: parsed.data.visibility, updatedById: user.id })
    // Translations follow their original, so only originals change here.
    .where(and(inArray(pages.id, parsed.data.ids), eq(pages.kind, "doc"), isNull(pages.translationOf)))
    .returning({ id: pages.id, title: pages.draftTitle, status: pages.status });
  if (changed.length === 0) return { ok: false, error: "Halaman tidak ditemukan." };
  // Translations follow their original.
  await syncTranslationVisibility(changed.map((page) => page.id), parsed.data.visibility);

  // Navigation, search, cards and the Tanya AI corpus are all cached under "pages".
  if (changed.some((page) => page.status === "published")) updateTag("pages");
  await Promise.all(
    changed.map((page) =>
      logActivity({
        user,
        action: "page.visibility",
        target: { type: "page", id: page.id, label: page.title || "Tanpa judul" },
        meta: { visibility: parsed.data.visibility },
      }),
    ),
  );
  return { ok: true, count: changed.length };
}
