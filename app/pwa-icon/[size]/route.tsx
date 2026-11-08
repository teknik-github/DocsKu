import { ImageResponse } from "next/og";
import { getSiteSettings } from "@/lib/data/site";
import { PWA_ICON_SIZES, pwaColors } from "@/lib/pwa";

/** App icon (PNG) for the manifest: the site's initial on its accent colour. `?maskable=1` keeps it inside the safe zone. */
export async function GET(request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!PWA_ICON_SIZES.includes(size as (typeof PWA_ICON_SIZES)[number])) return new Response("Not found", { status: 404 });
  const maskable = new URL(request.url).searchParams.get("maskable") === "1";
  const site = await getSiteSettings();
  const { accent } = pwaColors(site);
  const letter = (site.name.trim()[0] ?? "D").toUpperCase();
  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: maskable ? accent : "transparent" }}>
        <div
          style={{
            width: maskable ? "100%" : "88%",
            height: maskable ? "100%" : "88%",
            borderRadius: maskable ? 0 : size * 0.22,
            background: accent,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: size * (maskable ? 0.42 : 0.5),
            fontWeight: 600,
          }}
        >
          {letter}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
  image.headers.set("Cache-Control", "public, max-age=86400");
  return image;
}
