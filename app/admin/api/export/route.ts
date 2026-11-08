import { isSameOrigin } from "@/lib/auth/request";
import { readSessionUser } from "@/lib/auth/session";
import { buildDocsExport, buildJsonExport } from "@/lib/export";
import { logActivity } from "@/lib/activity";

/**
 * Downloads for Pengaturan → Cadangan & ekspor (admins only):
 *   ?jenis=dokumen (default) → ZIP of MDX files; ?status=semua, ?internal=1, ?terjemahan=1, ?media=1
 *   ?jenis=json → the full JSON export (no secrets)
 */
export async function GET(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Permintaan dari situs lain ditolak." }, { status: 403 });
  const user = await readSessionUser();
  if (!user) return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Hanya admin yang boleh mengekspor." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = (type: string, name: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "no-store",
  });

  if (params.get("jenis") === "json") {
    const data = await buildJsonExport();
    await logActivity({ user, action: "export.json", meta: { pages: data.pages.length } });
    return new Response(JSON.stringify(data, null, 2), { headers: headers("application/json; charset=utf-8", `docsku-data-${stamp}.json`) });
  }

  const options = {
    status: params.get("status") === "semua" ? ("all" as const) : ("published" as const),
    internal: params.get("internal") === "1",
    translations: params.get("terjemahan") === "1",
    media: params.get("media") === "1",
  };
  const { zip, pages, media } = await buildDocsExport(options);
  await logActivity({ user, action: "export.docs", meta: { ...options, pages, media } });
  return new Response(zip as Uint8Array<ArrayBuffer>, { headers: headers("application/zip", `docsku-dokumentasi-${stamp}.zip`) });
}
