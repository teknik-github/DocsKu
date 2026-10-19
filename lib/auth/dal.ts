import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@/db/schema";
import { readSessionUser } from "@/lib/auth/session";

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

/** For server actions: returns an error message instead of redirecting. */
export async function authorize(role?: Role): Promise<SessionUser | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesi Anda berakhir. Silakan masuk lagi." };
  if (role === "admin" && user.role !== "admin") return { error: "Hanya admin yang boleh melakukan ini." };
  return user;
}
