import { ExternalLink, PlayCircle } from "lucide-react";
import { EMBED_ALLOW, parseEmbed } from "@/lib/content/embed";
import { safeHref } from "@/lib/content/doc";

/** A YouTube/Vimeo/Loom video in a 16:9 frame (privacy-friendly player URLs, lazy). Other URLs become a link. */
export function Embed({ url, caption }: { url: string; caption?: string | null }) {
  const info = parseEmbed(url);
  if (!info) {
    const href = safeHref(url);
    if (!href) return null;
    return (
      <p>
        <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5">
          <PlayCircle className="size-4" />
          {caption || href}
          <ExternalLink className="size-3" />
        </a>
      </p>
    );
  }
  return (
    <figure className="not-prose my-6" data-embed={info.provider}>
      <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-fill">
        <iframe
          src={info.src}
          title={caption || `Video ${info.label}`}
          loading="lazy"
          allow={EMBED_ALLOW}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full"
        />
      </div>
      {caption && <figcaption className="mt-2 text-center text-sm text-fg-subtle">{caption}</figcaption>}
    </figure>
  );
}
