"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { readNavigation, writeNavigation } from "@/lib/automation";
import { findCategory, isCategoryImage, placePages } from "@/lib/categories";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const title = z.string().trim().min(1, "Nama wajib diisi.").max(80, "Nama paling banyak 80 karakter.");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const createSchema = z.object({
  title,
  /** An existing group (navigation tab) id, or a new group's name. */
  group: z.union([z.object({ id: z.string().min(1) }), z.object({ title })]),
});

/** New category (a navigation section). Empty categories stay off the public site. Admins only. */
export async function createCategory(input: z.input<typeof createSchema>): Promise<Result<{ id: string }>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { title: name, group } = parsed.data;

  const navigation = await readNavigation();
  const section = { id: randomUUID(), title: name, items: [] };
  let tabs = navigation.tabs;
  if ("id" in group) {
    const tab = tabs.find((t) => t.id === group.id);
    if (!tab) return { ok: false, error: "Grup tidak ditemukan." };
    if (tab.sections.some((s) => same(s.title, name))) return { ok: false, error: `Kategori "${name}" sudah ada di grup ${tab.title}.` };
    tabs = tabs.map((t) => (t === tab ? { ...t, sections: [...t.sections, section] } : t));
  } else {
    const existing = tabs.find((t) => same(t.title, group.title));
    if (existing) {
      if (existing.sections.some((s) => same(s.title, name))) return { ok: false, error: `Kategori "${name}" sudah ada di grup ${existing.title}.` };
      tabs = tabs.map((t) => (t === existing ? { ...t, sections: [...t.sections, section] } : t));
    } else {
      tabs = [...tabs, { id: randomUUID(), title: group.title, sections: [section] }];
    }
  }
  await writeNavigation({ tabs });
  updateTag("navigation");
  return { ok: true, id: section.id };
}

export async function renameCategory(sectionId: string, newTitle: string): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = title.safeParse(newTitle);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const navigation = await readNavigation();
  const found = findCategory(navigation, sectionId);
  if (!found) return { ok: false, error: "Kategori tidak ditemukan." };
  if (found.tab.sections.some((s) => s.id !== sectionId && same(s.title, parsed.data))) {
    return { ok: false, error: `Kategori "${parsed.data}" sudah ada di grup ${found.tab.title}.` };
  }
  await writeNavigation({
    tabs: navigation.tabs.map((tab) => ({
      ...tab,
      sections: tab.sections.map((s) => (s.id === sectionId ? { ...s, title: parsed.data } : s)),
    })),
  });
  updateTag("navigation");
  return { ok: true };
}

/** Deletes an empty category; a group left without categories goes too. */
export async function deleteCategory(sectionId: string): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const navigation = await readNavigation();
  const found = findCategory(navigation, sectionId);
  if (!found) return { ok: false, error: "Kategori tidak ditemukan." };
  if (found.section.items.length > 0) {
    return { ok: false, error: "Kategori ini masih berisi halaman atau tautan. Pindahkan isinya dulu, lalu hapus." };
  }
  const [waiting] = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .where(and(eq(schema.pages.navSection, sectionId), eq(schema.pages.kind, "doc")))
    .limit(1);
  if (waiting) return { ok: false, error: "Ada halaman draf yang akan masuk ke kategori ini saat terbit. Pindahkan halamannya dulu." };
  await writeNavigation({
    tabs: navigation.tabs
      .map((tab) => ({ ...tab, sections: tab.sections.filter((s) => s.id !== sectionId) }))
      .filter((tab) => tab.sections.length > 0),
  });
  updateTag("navigation");
  return { ok: true };
}

const moveSchema = z.object({ pageIds: z.array(z.uuid()).min(1).max(500), sectionId: z.string().min(1).nullable() });

/** Moves pages to a category (appended at its end), or out of every category with null. Admins only. */
export async function movePagesToCategory(pageIds: string[], sectionId: string | null): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = moveSchema.safeParse({ pageIds, sectionId });
  if (!parsed.success) return { ok: false, error: "Pilihan tidak valid." };
  const navigation = await readNavigation();
  if (sectionId && !findCategory(navigation, sectionId)) return { ok: false, error: "Kategori tidak ditemukan." };
  const docs = await db
    .select({ id: schema.pages.id })
    .from(schema.pages)
    .where(and(inArray(schema.pages.id, parsed.data.pageIds), eq(schema.pages.kind, "doc")));
  const ids = docs.map((d) => d.id);
  if (ids.length === 0) return { ok: false, error: "Halaman tidak ditemukan." };
  await writeNavigation(placePages(navigation, ids, sectionId));
  // "none" keeps automation from putting an uncategorised page back on its first publish.
  await db.update(schema.pages).set({ navSection: sectionId ?? "none" }).where(inArray(schema.pages.id, ids));
  updateTag("navigation");
  return { ok: true };
}

/** Sets (or with null removes) the image shown for a category instead of its automatic icon. Admins only. */
export async function setCategoryImage(sectionId: string, image: string | null): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  if (image !== null && !isCategoryImage(image.trim())) return { ok: false, error: "Gambar harus dari Media atau URL https." };
  const navigation = await readNavigation();
  if (!findCategory(navigation, sectionId)) return { ok: false, error: "Kategori tidak ditemukan." };
  await writeNavigation({
    tabs: navigation.tabs.map((tab) => ({
      ...tab,
      sections: tab.sections.map((s) => {
        if (s.id !== sectionId) return s;
        const next = { ...s };
        delete next.image;
        return image ? { ...next, image: image.trim() } : next;
      }),
    })),
  });
  updateTag("navigation");
  return { ok: true };
}
