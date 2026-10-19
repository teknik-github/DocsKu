import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { isSameOrigin } from "@/lib/auth/request";
import { readSessionUser } from "@/lib/auth/session";
import { detectImage, IMAGE_TYPES, MAX_UPLOAD_BYTES, mediaUrl, uploadDir, uploadPath } from "@/lib/media";

/** Lists uploaded images for the editor's media picker. */
const crossOrigin = () => Response.json({ error: "Permintaan dari situs lain ditolak." }, { status: 403 });

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return crossOrigin();
  if (!(await readSessionUser())) return Response.json({ error: "Tidak diizinkan." }, { status: 401 });
  const rows = await db
    .select({
      id: schema.media.id,
      filename: schema.media.filename,
      originalName: schema.media.originalName,
      size: schema.media.size,
    })
    .from(schema.media)
    .orderBy(desc(schema.media.createdAt))
    .limit(200);
  return Response.json(rows.map((row) => ({ ...row, url: mediaUrl(row.filename) })));
}

/** Uploads one image (multipart field "file"). */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return crossOrigin();
  const user = await readSessionUser();
  if (!user) return Response.json({ error: "Tidak diizinkan." }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ error: "Ukuran maksimal 10 MB." }, { status: 413 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return Response.json({ error: "Unggahan tidak valid." }, { status: 400 });
  }
  if (!(file instanceof File)) return Response.json({ error: "Pilih file gambar." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Ukuran maksimal 10 MB." }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = detectImage(bytes);
  if (!ext) {
    return Response.json({ error: "Format tidak didukung. Gunakan PNG, JPG, GIF, WebP, atau AVIF." }, { status: 415 });
  }

  const filename = `${randomUUID()}.${ext}`;
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  await writeFile(uploadPath(filename), bytes, { flag: "wx" });

  const originalName = (file.name || filename).slice(0, 200);
  const [row] = await db
    .insert(schema.media)
    .values({ filename, originalName, mimeType: IMAGE_TYPES[ext], size: bytes.length, uploadedById: user.id })
    .returning({ id: schema.media.id });

  return Response.json({ id: row.id, url: mediaUrl(filename), originalName }, { status: 201 });
}
