import { clientIp, publicOrigin } from "@/lib/auth/request";
import { allow } from "@/lib/auth/rate-limit";
import { articlePdf, categoryPdf, PdfBusyError, type PdfFile } from "@/lib/pdf/service";

/**
 * "Unduh PDF":
 * - /pdf/docs/<slug>: one published page (translations by their own slug;
 *   internal pages only for a signed-in team member).
 * - /pdf/kategori/<section id>[?bahasa=<code>]: every page of a category.
 * 404 when PDFs are switched off (Tema → PDF) or the page isn't readable.
 * Rendering is limited per IP (behind TRUST_PROXY) and across the server.
 */
const notFound = () => new Response("Tidak ditemukan", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });

function asciiName(name: string) {
  return name.replace(/[^\w.-]+/g, "-") || "dokumen.pdf";
}

function pdfResponse(file: PdfFile) {
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${asciiName(file.filename)}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Content-Length": String(file.data.length),
      // Internal articles never sit in a shared cache.
      "Cache-Control": file.internal ? "private, no-store" : "public, max-age=300",
      "X-Robots-Tag": "noindex",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const [kind, ...rest] = path.map((part) => decodeURIComponent(part));
  if (!rest.length || rest.some((part) => !part || part === "." || part === "..")) return notFound();

  const ip = clientIp(request.headers);
  if ((ip && !allow(`pdf:ip:${ip}`, 20, 60_000)) || !allow("pdf:all", 120, 60_000)) {
    return new Response("Terlalu banyak permintaan PDF. Coba lagi sebentar lagi.", { status: 429, headers: { "Retry-After": "60", "Content-Type": "text/plain; charset=utf-8" } });
  }

  const origin = publicOrigin(request);
  try {
    let file: PdfFile | null = null;
    if (kind === "docs") file = await articlePdf(rest.join("/"), origin);
    else if (kind === "kategori" && rest.length === 1) file = await categoryPdf(rest[0], new URL(request.url).searchParams.get("bahasa"), origin);
    return file ? pdfResponse(file) : notFound();
  } catch (error) {
    if (error instanceof PdfBusyError) {
      return new Response("Server sedang membuat PDF lain. Coba lagi sebentar lagi.", { status: 503, headers: { "Retry-After": "10", "Content-Type": "text/plain; charset=utf-8" } });
    }
    console.error("[pdf] gagal membuat PDF", path.join("/"), error);
    return new Response("PDF gagal dibuat.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
