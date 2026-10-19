import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getAutomation, getNavigation, getPublishedPage, getSiteSettings } from "@/lib/data/site";
import { findPage, slugToHref } from "@/lib/navigation";
import { coverAccent, coverStyle, stableHash } from "@/lib/cover-palette";
import type { CoverShape } from "@/lib/site-types";

/**
 * Each shape matches where the image is shown (see generatedCover), so
 * object-fit: cover never crops it; cards also get larger type because they
 * are displayed small.
 */
const SHAPES: Record<CoverShape, { width: number; height: number; padding: string; brand: number; section: number; title: [number, number] }> = {
  og: { width: 1200, height: 630, padding: "72px 80px", brand: 30, section: 26, title: [80, 64] },
  card: { width: 1200, height: 750, padding: "96px 104px", brand: 44, section: 36, title: [104, 84] },
  wide: { width: 1408, height: 640, padding: "72px 104px", brand: 30, section: 26, title: [84, 68] },
};

/**
 * Generated cover for published pages without their own (Pengaturan →
 * Otomatisasi → Sampul otomatis). Used on cards, Ghost articles, and as the
 * social preview image.
 */
export async function GET(request: Request, { params }: RouteContext<"/cover/[...slug]">) {
  await connection();
  const { slug } = await params;
  const requested = new URL(request.url).searchParams.get("shape");
  const shape = SHAPES[requested === "card" || requested === "wide" ? requested : "og"];
  const [page, automation, site, tabs] = await Promise.all([
    getPublishedPage(slug.join("/")),
    getAutomation(),
    getSiteSettings(),
    getNavigation(),
  ]);
  if (!page || !automation.cover) return new Response("Not found", { status: 404 });

  const section = findPage(tabs, slugToHref(page.slug))?.section;
  const colors = coverStyle(coverAccent(automation.coverColor, page.title), stableHash(page.title) % 360);
  const title = page.title.length > 90 ? `${page.title.slice(0, 88)}…` : page.title;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: shape.padding,
          backgroundColor: colors.page,
          backgroundImage: colors.background,
          color: "#141413",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: shape.brand * 0.55, fontSize: shape.brand }}>
          <div
            style={{
              width: shape.brand * 1.6,
              height: shape.brand * 1.6,
              borderRadius: shape.brand * 0.4,
              backgroundColor: colors.badge,
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: shape.brand * 0.95,
            }}
          >
            {site.name.charAt(0).toUpperCase() || "D"}
          </div>
          {site.name}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {section && (
            <div style={{ fontSize: shape.section, letterSpacing: 2, textTransform: "uppercase", color: colors.label }}>{section}</div>
          )}
          <div style={{ fontSize: shape.title[title.length > 40 ? 1 : 0], lineHeight: 1.1, letterSpacing: -1.5 }}>{title}</div>
        </div>
      </div>
    ),
    {
      width: shape.width,
      height: shape.height,
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    },
  );
}
