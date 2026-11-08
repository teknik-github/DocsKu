import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@/db/schema";
import { readSessionUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/permissions";

/**
 * Data access layer for auth. Every admin page and every server action calls
 * one of these itself; layouts alone are not a security boundary.
 */

export type SessionUser = { id: string; email: string; name: string; role: Role };

/** Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => readSessionUser());

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/admin");
  return user;
}

/** Pages that need a permission (lib/auth/permissions.ts); others are sent to the dashboard. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) redirect("/admin");
  return user;
}

/** Admins and editors (not contributors). */
export const requireStaff = () => requirePermission("pages.editAny");

/**
 * What a server action needs:
 * - nothing: admins and editors (contributors are refused, so a new action is closed to them by default);
 * - "any": every signed-in user, contributors included (check page ownership with `canEditPage`);
 * - "admin" or a permission from lib/auth/permissions.ts.
 */
export type Need = "any" | "admin" | Permission;

/** For server actions: returns an error message instead of redirecting. */
export async function authorize(need?: Need): Promise<SessionUser | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesi Anda berakhir. Silakan masuk lagi." };
  if (need === "any") return user;
  if (need === "admin" || need === "site.admin") {
    return user.role === "admin" ? user : { error: "Hanya admin yang boleh melakukan ini." };
  }
  if (!can(user, need ?? "pages.editAny")) return { error: user.role === "contributor" ? "Kontributor tidak boleh melakukan ini." : "Anda tidak punya izin untuk ini." };
  return user;
}
