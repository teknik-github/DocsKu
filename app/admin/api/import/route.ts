import { isSameOrigin } from "@/lib/auth/request";
import { readSessionUser } from "@/lib/auth/session";
import { IMPORT_LIMITS, parseUpload } from "@/lib/import";

/** Step 1 of Halaman → Impor: reads the uploaded files ("files", multipart) and returns the preview. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Permintaan dari situs lain ditolak." }, { status: 403 });
  const user = await readSessionUser();
  if (!user) return Response.json({ error: "Sesi Anda berakhir. Silakan masuk lagi." }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > IMPORT_LIMITS.uploadBytes + 1024 * 1024) return Response.json({ error: "Unggahan maksimal 50 MB." }, { status: 413 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Unggahan tidak valid." }, { status: 400 });
  }
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (!files.length) return Response.json({ error: "Pilih berkas .md, .mdx, atau .zip." }, { status: 400 });
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > IMPORT_LIMITS.uploadBytes) return Response.json({ error: "Unggahan maksimal 50 MB." }, { status: 413 });

  const result = await parseUpload(
    await Promise.all(files.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }))),
    user.id,
  );
  if ("error" in result) return Response.json(result, { status: 422 });
  if (!result.items.length) return Response.json({ error: "Tidak ada berkas Markdown yang bisa diimpor.", skipped: result.skipped }, { status: 422 });
  return Response.json(result);
}
