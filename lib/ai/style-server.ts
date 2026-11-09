import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getGlossary } from "@/lib/data/site";
import { DEFAULT_STYLE, styleGuideText, type WritingStyle } from "@/lib/ai/style";

export async function readWritingStyle(): Promise<WritingStyle> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "ai_style"));
  return { ...DEFAULT_STYLE, ...((row?.value as Partial<WritingStyle> | undefined) ?? {}) };
}

/** The prompt text for the team's style, with the glossary when that is on. */
export async function writingStyleText(): Promise<string> {
  const style = await readWritingStyle();
  const glossary = style.useGlossary ? (await getGlossary()).terms : [];
  return styleGuideText(style, glossary);
}
