import { readFile } from "node:fs/promises";
import { connection } from "next/server";
import { IMAGE_TYPES, STORED_NAME, uploadPath, type ImageExt } from "@/lib/media";

/** Serves uploaded images from UPLOAD_DIR. File names are random and never reused. */
export async function GET(_: Request, { params }: RouteContext<"/media/[file]">) {
  await connection();
  const { file } = await params;
  if (!STORED_NAME.test(file)) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await readFile(uploadPath(file));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const ext = file.split(".").pop() as ImageExt;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": IMAGE_TYPES[ext],
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
}
