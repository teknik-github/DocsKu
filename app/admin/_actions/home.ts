"use server";

import { updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { homeSectionsSchema } from "@/lib/home-schema";
import type { HomeSection } from "@/lib/site-types";

/**
 * The home page builder (/admin/home). Every change autosaves the working copy
 * ("home_draft", seen only in the builder's preview); publishing copies it to
 * "home", which visitors see. Same people as the old home editor: any signed-in user.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function put(key: "home" | "home_draft", sections: HomeSection[]) {
  const value = { sections };
  await db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

function validate(sections: unknown): { sections: HomeSection[] } | { error: string } {
  const parsed = homeSectionsSchema.safeParse(sections);
  if (parsed.success) return { sections: parsed.data as HomeSection[] };
  const issue = parsed.error.issues[0];
  // Name the section, so the message points somewhere: "Bagian 3: Isi teks tombol."
  const index = typeof issue.path[0] === "number" ? issue.path[0] + 1 : null;
  return { error: index ? `Bagian ${index}: ${issue.message}` : issue.message };
}

export async function saveHomeDraft(sections: HomeSection[]): Promise<Result<{ savedAt: string }>> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const checked = validate(sections);
  if ("error" in checked) return { ok: false, error: checked.error };
  await put("home_draft", checked.sections);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function publishHome(sections: HomeSection[]): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const checked = validate(sections);
  if ("error" in checked) return { ok: false, error: checked.error };
  await put("home", checked.sections);
  await db.delete(schema.settings).where(eq(schema.settings.key, "home_draft"));
  updateTag("settings");
  return { ok: true };
}

export async function discardHomeDraft(): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  await db.delete(schema.settings).where(eq(schema.settings.key, "home_draft"));
  return { ok: true };
}
