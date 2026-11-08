"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity";
import { forgetWidgetFrame } from "@/lib/widget-frame";
import { MAX_WIDGET_ORIGINS, normaliseOrigin } from "@/lib/widget";
import type { WidgetSettings } from "@/lib/site-types";

type Result = { ok: true; value: WidgetSettings } | { ok: false; error: string };

const widgetSchema = z.object({
  enabled: z.boolean(),
  allowedOrigins: z.array(z.string().max(300)).max(MAX_WIDGET_ORIGINS, `Maksimal ${MAX_WIDGET_ORIGINS} situs.`),
  label: z.string().trim().min(1, "Isi teks tombol.").max(30, "Teks tombol maksimal 30 karakter."),
  position: z.enum(["right", "left"]),
  accent: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Warna harus berformat #rrggbb.")
    .nullable(),
  greeting: z.string().trim().max(120, "Sapaan maksimal 120 karakter."),
  ai: z.boolean(),
});

/** Pengaturan → Widget bantuan. Admins only. */
export async function saveWidgetSettings(input: WidgetSettings): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = widgetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const origins: string[] = [];
  const invalid: string[] = [];
  for (const raw of parsed.data.allowedOrigins) {
    if (!raw.trim()) continue;
    const origin = normaliseOrigin(raw);
    if (!origin) invalid.push(raw.trim());
    else if (!origins.includes(origin)) origins.push(origin);
  }
  if (invalid.length) {
    return {
      ok: false,
      error: `Alamat tidak valid: ${invalid.join(", ")}. Pakai https://domain (atau http://localhost untuk uji coba), boleh *.domain untuk subdomain.`,
    };
  }

  const value: WidgetSettings = { ...parsed.data, allowedOrigins: origins, greeting: parsed.data.greeting || "Hai! Ada yang bisa kami bantu?" };
  await db
    .insert(schema.settings)
    .values({ key: "widget", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  updateTag("settings");
  forgetWidgetFrame();
  await logActivity({
    user: { id: user.id, name: user.name },
    action: "settings.save",
    target: { type: "settings", id: "widget", label: "Widget bantuan" },
    meta: { section: "widget", enabled: value.enabled, origins: value.allowedOrigins.length },
  });
  return { ok: true, value };
}
