/**
 * Video embeds (the `embed` block): only these providers, always through their
 * privacy-friendly player URLs. Anything else is shown as a plain link.
 */

export type EmbedInfo = { provider: "youtube" | "vimeo" | "loom"; label: string; src: string };

const YOUTUBE_ID = /^[\w-]{11}$/;

/** Seconds from a YouTube `t`/`start` value: "90", "90s", "1m30s", "1h2m3s". */
function seconds(value: string | null): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

export function parseEmbed(raw: unknown): EmbedInfo | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^www\.|^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
    const id = host === "youtu.be" ? parts[0] : parts[0] === "watch" || parts.length === 0 ? url.searchParams.get("v") : ["embed", "shorts", "live", "v"].includes(parts[0]) ? parts[1] : null;
    if (!id || !YOUTUBE_ID.test(id)) return null;
    const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
    return { provider: "youtube", label: "YouTube", src: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}` };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parts.find((part) => /^\d{5,12}$/.test(part));
    if (!id) return null;
    return { provider: "vimeo", label: "Vimeo", src: `https://player.vimeo.com/video/${id}?dnt=1` };
  }
  if (host === "loom.com") {
    const id = parts[0] === "share" || parts[0] === "embed" ? parts[1] : null;
    if (!id || !/^[a-f0-9]{16,40}$/i.test(id)) return null;
    return { provider: "loom", label: "Loom", src: `https://www.loom.com/embed/${id}` };
  }
  return null;
}

export const EMBED_ALLOW = "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
