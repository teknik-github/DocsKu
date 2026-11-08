import "server-only";
import type { JSONContent } from "@tiptap/core";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { mdxToDoc } from "@/lib/content/mdx-to-doc";
import { tocHeadings } from "@/lib/content/doc";
import { BUILTIN_TEMPLATES, builtinId } from "@/lib/templates-builtin";

/**
 * Page templates: the built-in ones (lib/templates-builtin.ts, MDX) and the
 * team's own (`page_templates`, TipTap JSON saved from the editor).
 * `createPage` seeds a new draft's working copy from one.
 */

export type TemplateChoice = {
  /** "builtin:<key>" or a page_templates uuid. */
  id: string;
  name: string;
  description: string;
  icon: string;
  builtin: boolean;
  /** ## headings of the content, for the picker's preview. */
  outline: string[];
  createdBy: string | null;
  createdById: string | null;
  updatedAt: string | null;
};

const outlineOf = (doc: JSONContent) => tocHeadings(doc).filter((h) => h.level === 2).map((h) => h.text).slice(0, 8);

const builtinDocs = new Map<string, JSONContent>();
function builtinDoc(key: string) {
  let doc = builtinDocs.get(key);
  if (!doc) {
    const template = BUILTIN_TEMPLATES.find((t) => t.key === key);
    if (!template) return null;
    doc = mdxToDoc(template.mdx);
    builtinDocs.set(key, doc);
  }
  return doc;
}

export async function listTemplateChoices(): Promise<TemplateChoice[]> {
  const custom = await db
    .select({
      id: schema.pageTemplates.id,
      name: schema.pageTemplates.name,
      description: schema.pageTemplates.description,
      icon: schema.pageTemplates.icon,
      content: schema.pageTemplates.content,
      createdById: schema.pageTemplates.createdById,
      createdBy: schema.users.name,
      updatedAt: schema.pageTemplates.updatedAt,
    })
    .from(schema.pageTemplates)
    .leftJoin(schema.users, eq(schema.pageTemplates.createdById, schema.users.id))
    .orderBy(desc(schema.pageTemplates.updatedAt));
  return [
    ...BUILTIN_TEMPLATES.map((t) => ({
      id: builtinId(t.key),
      name: t.name,
      description: t.description,
      icon: t.icon,
      builtin: true,
      outline: outlineOf(builtinDoc(t.key)!),
      createdBy: null,
      createdById: null,
      updatedAt: null,
    })),
    ...custom.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      icon: t.icon ?? "file-text",
      builtin: false,
      outline: outlineOf(t.content),
      createdBy: t.createdBy,
      createdById: t.createdById,
      updatedAt: t.updatedAt.toISOString(),
    })),
  ];
}

/** What a new page starts with, or null for an unknown id. */
export async function templateSeed(id: string): Promise<{ name: string; title: string; description: string; content: JSONContent } | null> {
  if (id.startsWith("builtin:")) {
    const template = BUILTIN_TEMPLATES.find((t) => builtinId(t.key) === id);
    const doc = template && builtinDoc(template.key);
    return template && doc ? { name: template.name, title: template.pageTitle, description: template.pageDescription, content: structuredClone(doc) } : null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ name: schema.pageTemplates.name, title: schema.pageTemplates.pageTitle, description: schema.pageTemplates.pageDescription, content: schema.pageTemplates.content })
    .from(schema.pageTemplates)
    .where(eq(schema.pageTemplates.id, id));
  return row ?? null;
}
