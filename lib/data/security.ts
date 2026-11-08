import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { eq } from "drizzle-orm";
import { buildingWithoutDatabase, db, schema } from "@/db";

/** Settings key "security" (Pengaturan → Keamanan). */
export type SecuritySettings = {
  /** Admins without 2FA are sent to Profil after login and see a banner until they turn it on. */
  requireAdmin2fa: boolean;
};

export const DEFAULT_SECURITY: SecuritySettings = { requireAdmin2fa: false };

export async function getSecuritySettings(): Promise<SecuritySettings> {
  "use cache";
  cacheTag("settings");
  cacheLife("max");
  if (buildingWithoutDatabase) return DEFAULT_SECURITY;
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "security"));
  return { ...DEFAULT_SECURITY, ...(row?.value as Partial<SecuritySettings> | undefined) };
}
