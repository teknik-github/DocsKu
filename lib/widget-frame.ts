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
type Loaded = { value: string; enabled: boolean; at: number };
// globalThis, so the settings action and the proxy (separate bundles, one process) share it.
const store = globalThis as unknown as { docskuWidgetFrame?: Promise<Loaded> };

async function load(): Promise<Loaded> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "widget"));
  const settings: WidgetSettings = { ...DEFAULT_WIDGET, ...(row?.value as Partial<WidgetSettings> | undefined) };
  return { value: widgetFrameAncestors(settings), enabled: settings.enabled, at: Date.now() };
}

async function current(): Promise<Loaded> {
  let loaded = store.docskuWidgetFrame;
  if (loaded && Date.now() - (await loaded).at > RELOAD_MS) loaded = undefined;
  if (!loaded) {
    loaded = load();
    store.docskuWidgetFrame = loaded;
    loaded.catch(() => (store.docskuWidgetFrame = undefined));
  }
  return loaded;
}

/** The frame-ancestors sources for /widget; "'none'" when the widget is off or the lookup fails. */
export async function widgetFrameSources(): Promise<string> {
  try {
    return (await current()).value;
  } catch {
    return "'none'";
  }
}

/**
 * Whether the widget is switched on. proxy.ts answers /widget… with a 404 when
 * it isn't, so the pages themselves never decide from cached settings (a
 * prerendered "off" page would otherwise outlive the switch). A failed lookup
 * counts as on; framing is then closed anyway ("'none'").
 */
export async function widgetEnabled(): Promise<boolean> {
  try {
    return (await current()).enabled;
  } catch {
    return true;
  }
}

/** Drops the in-memory copy after the settings change. */
export function forgetWidgetFrame() {
  store.docskuWidgetFrame = undefined;
}
