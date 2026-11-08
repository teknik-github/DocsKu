import "server-only";
import https from "node:https";
import { readFile } from "node:fs/promises";
import type { JSONContent } from "@tiptap/core";
import { walk } from "@/lib/content/doc";
import { detectImage, STORED_NAME, uploadPath } from "@/lib/media";
import { guardedLookup, urlProblem } from "@/lib/link-check";

/**
 * Image bytes for the PDF renderer, loaded before rendering. react-pdf embeds
 * PNG and JPEG only; other formats (GIF, WebP, AVIF) and failures come back as
 * null, and the document shows the image's alt text instead.
 * - `/media/<file>`: read from UPLOAD_DIR.
 * - `https://…`: fetched with the link checker's SSRF guard (public addresses
 *   only, a fresh connection per request), 5 s, 4 MB, no redirects.
 */
export type PdfImage = { data: Buffer; format: "png" | "jpg" } | null;

const MAX_REMOTE_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 5000;
const MAX_IMAGES = 40;

function fetchRemote(raw: string): Promise<Buffer | null> {
  if (urlProblem(raw) || !raw.startsWith("https://")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = https.get(
      raw,
      { lookup: guardedLookup, agent: false, timeout: TIMEOUT_MS, headers: { "user-agent": "DocskuPdf/1.0", accept: "image/png,image/jpeg" } },
      (res) => {
        if ((res.statusCode ?? 0) !== 200) {
          res.destroy();
          return resolve(null);
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_REMOTE_BYTES) {
            res.destroy();
            resolve(null);
          } else chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", () => resolve(null));
      },
    );
    const timer = setTimeout(() => req.destroy(), TIMEOUT_MS);
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.on("close", () => clearTimeout(timer));
  });
}

async function load(src: string): Promise<PdfImage> {
  let bytes: Buffer | null = null;
  const media = src.match(/^\/media\/([^/?#]+)$/);
  if (media) {
    if (!STORED_NAME.test(media[1])) return null;
    bytes = await readFile(uploadPath(media[1])).catch(() => null);
  } else if (/^https:\/\//i.test(src)) {
    bytes = await fetchRemote(src);
  }
  if (!bytes) return null;
  const type = detectImage(bytes);
  return type === "png" || type === "jpg" ? { data: bytes, format: type } : null;
}

/** Every image source used in the documents (image nodes and the cover), loaded at most 4 at a time. */
export async function loadImages(docs: JSONContent[], extra: (string | null | undefined)[] = []): Promise<Map<string, PdfImage>> {
  const sources = new Set<string>();
  for (const doc of docs) {
    walk(doc, (node) => {
      if (node.type === "image" && typeof node.attrs?.src === "string") sources.add(node.attrs.src);
    });
  }
  for (const src of extra) if (src) sources.add(src);
  const list = [...sources].slice(0, MAX_IMAGES);
  const result = new Map<string, PdfImage>();
  for (let i = 0; i < list.length; i += 4) {
    const batch = list.slice(i, i + 4);
    const loaded = await Promise.all(batch.map((src) => load(src).catch(() => null)));
    batch.forEach((src, j) => result.set(src, loaded[j]));
  }
  return result;
}
