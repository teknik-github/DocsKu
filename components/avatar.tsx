import { initials } from "@/lib/authors";
import { stableHash } from "@/lib/cover-palette";
import { fixedImage } from "@/lib/responsive-image";

/**
 * A person's photo as a circle (`object-cover`), or their initials on a colour
 * derived from the name, so the same person looks the same everywhere.
 * No hooks: usable from server and client components alike.
 */
export function Avatar({ name, src, size = 32, className = "" }: { name: string; src?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...fixedImage(src, size)} alt="" width={size} height={size} loading="lazy" decoding="async" className={`shrink-0 rounded-full bg-fill object-cover ${className}`} style={style} />;
  }
  const hue = stableHash(name || "?") % 360;
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium select-none ${className}`}
      style={{ ...style, background: `hsl(${hue} 55% 88%)`, color: `hsl(${hue} 45% 28%)` }}
    >
      {initials(name)}
    </span>
  );
}
