import Link from "next/link";
import { Star } from "lucide-react";
import { formatDate } from "@/lib/format";
import { stableHash } from "@/lib/cover-palette";
import type { PageCard } from "@/lib/site-types";

/** The page's cover image, or a generated one (tinted pattern with the title's initial). */
export function CoverArt({ src, title, className = "" }: { src: string | null; title: string; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" className={`h-full w-full object-cover ${className}`} />;
  }
  const h = stableHash(title);
  const angle = h % 360;
  const mix = 20 + (h % 30);
  return (
    <div
      aria-hidden
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(${angle}deg, color-mix(in srgb, var(--accent) ${mix}%, var(--surface)), color-mix(in srgb, var(--accent) 6%, var(--fill)))`,
      }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{ backgroundImage: "radial-gradient(color-mix(in srgb, var(--accent) 45%, transparent) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
      />
      <span className="relative font-serif text-5xl font-light text-accent/80">{title.trim().charAt(0).toUpperCase() || "D"}</span>
    </div>
  );
}

export function Meta({ card }: { card: Pick<PageCard, "publishedAt" | "readingMinutes"> }) {
  return (
    <span className="text-xs text-fg-subtle">
      {card.publishedAt && `${formatDate(card.publishedAt)} · `}
      {card.readingMinutes} menit baca
    </span>
  );
}

/** A card linking to a docs page: cover, tag, title, excerpt, date and reading time. */
export function PageCardView({
  card,
  tag,
  showFeatured = false,
  size = "md",
}: {
  card: PageCard;
  tag?: string;
  showFeatured?: boolean;
  size?: "md" | "lg";
}) {
  return (
    <Link href={card.href} prefetch={true} className="group flex flex-col">
      <div className={`overflow-hidden rounded-xl border border-line bg-fill ${size === "lg" ? "aspect-[16/9]" : "aspect-[16/10]"}`}>
        <CoverArt src={card.cover} title={card.title} className="transition-transform duration-300 group-hover:scale-[1.03]" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        {tag && <span className="text-[11px] font-semibold tracking-wide text-accent uppercase">{tag}</span>}
        {showFeatured && card.featured && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted">
            <Star className="size-3 fill-current text-accent" />
            Unggulan
          </span>
        )}
      </div>
      <h3 className={`mt-1.5 font-semibold text-fg group-hover:text-accent ${size === "lg" ? "text-xl" : "text-base"}`}>{card.title}</h3>
      {card.description && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-fg-muted">{card.description}</p>}
      <span className="mt-2">
        <Meta card={card} />
      </span>
    </Link>
  );
}
