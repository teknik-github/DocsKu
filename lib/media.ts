import "server-only";
import path from "node:path";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
} as const;
export type ImageExt = keyof typeof IMAGE_TYPES;

/** Stored files are named `<uuid>.<ext>`; anything else is rejected when serving. */
export const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|avif)$/;

export function uploadDir() {
  // Runtime data, not source: keep the bundler from tracing the whole project.
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.UPLOAD_DIR || "./storage/uploads");
}

/** Absolute path of a stored upload. Only call with names matching STORED_NAME. */
export function uploadPath(filename: string) {
  return path.join(/*turbopackIgnore: true*/ uploadDir(), filename);
}

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

/**
 * Detects the image type from the file's first bytes rather than trusting the
 * name or the browser's MIME type. SVG is deliberately not accepted, since it
 * can carry scripts.
 */
export function detectImage(bytes: Uint8Array): ImageExt | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (ascii(bytes, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(bytes, 8, 12))) return "avif";
  return null;
}

export const mediaUrl = (filename: string) => `/media/${filename}`;
