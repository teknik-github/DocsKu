import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { WidgetSettings } from "@/lib/site-types";
import { DEFAULT_WIDGET, widgetFrameAncestors } from "@/lib/widget";

/**
 * The /widget frame policy, set by proxy.ts at request time because the allowed
 * origins live in the database. Kept in memory like the redirects map: reloaded
 * after RELOAD_MS, or at once after Pengaturan → Widget bantuan is saved.
 */

const RELOAD_MS = 60_000;
type Loaded = { value: string; at: number };
// globalThis, so the settings action and the proxy (separate bundles, one process) share it.
const store = globalThis as unknown as { docskuWidgetFrame?: Promise<Loaded> };

async function load(): Promise<Loaded> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "widget"));
  const settings: WidgetSettings = { ...DEFAULT_WIDGET, ...(row?.value as Partial<WidgetSettings> | undefined) };
  return { value: widgetFrameAncestors(settings), at: Date.now() };
}

/** The frame-ancestors sources for /widget; "'none'" when the widget is off or the lookup fails. */
export async function widgetFrameSources(): Promise<string> {
  let loaded = store.docskuWidgetFrame;
  if (loaded && Date.now() - (await loaded).at > RELOAD_MS) loaded = undefined;
  if (!loaded) {
    loaded = load();
    store.docskuWidgetFrame = loaded;
    loaded.catch(() => (store.docskuWidgetFrame = undefined));
  }
  try {
    return (await loaded).value;
  } catch {
    return "'none'";
  }
}

/** Drops the in-memory copy after the settings change. */
export function forgetWidgetFrame() {
  store.docskuWidgetFrame = undefined;
}
