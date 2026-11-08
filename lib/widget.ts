import type { WidgetSettings } from "@/lib/site-types";

/**
 * Help widget helpers shared by the settings form, the /widget pages, the
 * proxy (frame-ancestors) and /widget.js. Plain module: no server-only code.
 */

export const DEFAULT_WIDGET: WidgetSettings = {
  enabled: false,
  allowedOrigins: [],
  label: "Bantuan",
  position: "right",
  accent: null,
  greeting: "Hai! Ada yang bisa kami bantu?",
  ai: true,
};

export const MAX_WIDGET_ORIGINS = 20;

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/**
 * Normalises one allowed origin: "https://app.example.com/path" → "https://app.example.com".
 * A leading "*." wildcard is allowed for subdomains. Plain http only for localhost.
 * Returns null when it isn't a usable origin.
 */
export function normaliseOrigin(input: string): string | null {
  const value = input.trim().replace(/\/+$/, "").toLowerCase();
  const match = /^(https?):\/\/(\*\.)?([a-z0-9.-]+|\[::1\])(:\d{1,5})?(\/.*)?$/.exec(value);
  if (!match) return null;
  const [, scheme, wildcard = "", host, port = ""] = match;
  if (scheme === "http" && !LOCAL_HOSTS.test(host)) return null;
  if (wildcard && LOCAL_HOSTS.test(host)) return null;
  const validHost =
    host === "localhost" || host === "[::1]" || (host.includes(".") && host.split(".").every((part) => part && !part.startsWith("-") && !part.endsWith("-")));
  if (!validHost) return null;
  // A wildcard needs a real domain under it ("*.com" would allow half the web).
  if (wildcard && !host.includes(".")) return null;
  return `${scheme}://${wildcard}${host}${port}`;
}

/** Whether a page at `origin` (e.g. event.origin) may embed the widget. */
export function originAllowed(origin: string, allowed: string[]): boolean {
  const lower = origin.toLowerCase();
  return allowed.some((entry) => {
    if (!entry.includes("://*.")) return entry === lower;
    const [scheme, rest] = entry.split("://*.");
    const target = /^(https?):\/\/([^/]+)$/.exec(lower);
    if (!target || target[1] !== scheme) return false;
    // "*.example.com" covers sub.example.com (and deeper), not example.com itself, like CSP.
    return target[2].endsWith(`.${rest}`);
  });
}

/** The frame-ancestors value for /widget: the allowed origins, or nobody. The site itself may frame it (settings preview). */
export function widgetFrameAncestors(settings: Pick<WidgetSettings, "enabled" | "allowedOrigins">): string {
  if (!settings.enabled) return "'none'";
  return ["'self'", ...settings.allowedOrigins].join(" ");
}

export const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
