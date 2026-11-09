"use server";

import { authorize } from "@/lib/auth/dal";
import { db, schema } from "@/db";
import { logActivity } from "@/lib/activity";
import { styleSchema, type WritingStyle } from "@/lib/ai/style";

/** Pengaturan → Gaya penulisan (admins): the style every AI tool writes in. */
export async function saveWritingStyle(input: WritingStyle): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = styleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db
    .insert(schema.settings)
    .values({ key: "ai_style", value: parsed.data })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: parsed.data } });
  await logActivity({ user, action: "settings.save", target: { type: "settings", id: "gaya", label: "Gaya penulisan" } });
  return { ok: true };
}
