import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { IMAGE_TYPES, STORED_NAME, uploadPath, variantDir, type ImageExt } from "@/lib/media";
import { MEDIA_WIDTHS, type MediaWidth } from "@/lib/responsive-image";

/**
 * Serves uploaded images from UPLOAD_DIR. File names are random and never reused.
 *
 * `?w=<width>` (one of MEDIA_WIDTHS) returns a resized WebP, never wider than
 * the original, made with sharp and kept in `UPLOAD_DIR/.cache` so each
 * variant is encoded once. GIFs (possibly animated) are always served as they
 * are. Public pages ask for variants through lib/responsive-image.ts.
 */

const HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

const notFound = () => new Response("Not found", { status: 404 });

/** Variants being encoded right now, so concurrent requests for the same one share the work. */
const pending = (globalThis as unknown as { docskuVariants?: Map<string, Promise<Buffer>> }).docskuVariants ?? new Map<string, Promise<Buffer>>();
(globalThis as unknown as { docskuVariants?: Map<string, Promise<Buffer>> }).docskuVariants = pending;

async function variant(file: string, width: MediaWidth): Promise<Buffer> {
  const target = path.join(/*turbopackIgnore: true*/ variantDir(), `${file.replace(/\.[a-z]+$/, "")}-${width}.webp`);
  try {
    return await readFile(target);
  } catch {
    // Not made yet.
  }
  const key = target;
  let job = pending.get(key);
  if (!job) {
    job = (async () => {
      const { default: sharp } = await import("sharp");
      const output = await sharp(uploadPath(file), { limitInputPixels: 100_000_000 })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      await mkdir(variantDir(), { recursive: true });
      const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, output);
      await rename(temp, target).catch(async () => unlink(temp).catch(() => {}));
      return output;
    })().finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job;
}

export async function GET(request: Request, { params }: RouteContext<"/media/[file]">) {
  await connection();
  const { file } = await params;
  if (!STORED_NAME.test(file)) return notFound();
  const ext = file.split(".").pop() as ImageExt;

  const asked = new URL(request.url).searchParams.get("w");
  const width = MEDIA_WIDTHS.find((allowed) => String(allowed) === asked);
  if (asked !== null && !width) return new Response("Unsupported width", { status: 400 });

  if (width && ext !== "gif") {
    if (!(await access(uploadPath(file)).then(() => true, () => false))) return notFound();
    try {
      const data = await variant(file, width);
      return new Response(new Uint8Array(data), { headers: { ...HEADERS, "Content-Type": "image/webp" } });
    } catch (error) {
      // A file sharp can't read is served as it is.
      console.error("[media] varian gagal dibuat", file, width, error);
    }
  }

  let data: Buffer;
  try {
    data = await readFile(uploadPath(file));
  } catch {
    return notFound();
  }
  return new Response(new Uint8Array(data), { headers: { ...HEADERS, "Content-Type": IMAGE_TYPES[ext] } });
}
