/**
 * Responsive images for uploads (`/media/<uuid>.<ext>`). The media route
 * serves `?w=<width>` as a resized WebP (app/media/[file]/route.ts, variants
 * cached on disk); these helpers build the `srcset`. Anything else (external
 * https images, GIFs, which may be animated) is left as it is.
 *
 * Pure functions with no Node APIs: usable from server and client components.
 */

/** The only widths the media route resizes to (an allow-list, so variants can't be multiplied at will). */
export const MEDIA_WIDTHS = [160, 320, 640, 960, 1280, 1920] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

const RESIZABLE = /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|avif)$/;

/** An upload the media route can resize (not a GIF, not external). */
export const isResizableMedia = (src: string | null | undefined): src is string => !!src && RESIZABLE.test(src);

export const mediaVariant = (src: string, width: MediaWidth) => `${src}?w=${width}`;

/** The smallest allowed width at least `px` wide (or the largest one). */
export function mediaWidthFor(px: number): MediaWidth {
  return MEDIA_WIDTHS.find((width) => width >= px) ?? MEDIA_WIDTHS[MEDIA_WIDTHS.length - 1];
}

/**
 * `src`/`srcSet`/`sizes` for an <img>. `maxWidth` caps the variants offered
 * (no 1920 for a card), and the original width (when known) caps them too,
 * since the route never enlarges.
 */
export function responsiveImage(src: string, { sizes, maxWidth = 1920, intrinsicWidth }: { sizes: string; maxWidth?: number; intrinsicWidth?: number }) {
  if (!isResizableMedia(src)) return { src };
  const cap = Math.min(maxWidth, intrinsicWidth ?? Infinity);
  const candidates: { width: MediaWidth; actual: number }[] = MEDIA_WIDTHS.filter((width) => width <= cap).map((width) => ({ width, actual: width }));
  // An original between two allowed widths: the next one up returns it at full size (never enlarged).
  if (intrinsicWidth && intrinsicWidth <= maxWidth && !candidates.some((c) => c.actual === intrinsicWidth)) {
    const full = MEDIA_WIDTHS.find((width) => width > intrinsicWidth);
    if (full) candidates.push({ width: full, actual: intrinsicWidth });
  }
  if (!candidates.length) return { src: mediaVariant(src, MEDIA_WIDTHS[0]) };
  const largest = candidates[candidates.length - 1];
  return {
    src: mediaVariant(src, largest.width),
    srcSet: candidates.map((c) => `${mediaVariant(src, c.width)} ${c.actual}w`).join(", "),
    sizes,
  };
}

/** A fixed-size image (avatars, icons): one variant for 1x and one for 2x screens. */
export function fixedImage(src: string, px: number) {
  if (!isResizableMedia(src)) return { src };
  const one = mediaWidthFor(px);
  const two = mediaWidthFor(px * 2);
  return { src: mediaVariant(src, one), srcSet: one === two ? undefined : `${mediaVariant(src, one)} 1x, ${mediaVariant(src, two)} 2x` };
}
