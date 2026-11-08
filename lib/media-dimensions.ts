import "server-only";
import { closeSync, openSync, readSync } from "node:fs";
import { STORED_NAME, uploadPath } from "@/lib/media";

/**
 * Width and height of an uploaded image, read from the first bytes of the
 * file (PNG, JPEG, GIF, WebP, AVIF) and kept in memory: stored names are never
 * reused, so the answer never changes. Rendered pages use it for the <img>
 * width/height, so the browser reserves the space before the image loads.
 * Returns null for anything it can't read; the image then just has no size.
 */
export type Dimensions = { width: number; height: number };

const HEAD_BYTES = 128 * 1024;
const cache = (globalThis as unknown as { docskuMediaDims?: Map<string, Dimensions | null> }).docskuMediaDims ?? new Map<string, Dimensions | null>();
(globalThis as unknown as { docskuMediaDims?: Map<string, Dimensions | null> }).docskuMediaDims = cache;

const u16be = (b: Buffer, i: number) => b.readUInt16BE(i);
const u24le = (b: Buffer, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

function parse(b: Buffer): Dimensions | null {
  if (b.length < 30) return null;
  // PNG: IHDR right after the signature.
  if (b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  // GIF: logical screen size.
  if (b.toString("latin1", 0, 3) === "GIF") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  // WebP: lossy (VP8), lossless (VP8L) or extended (VP8X).
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") {
    const chunk = b.toString("latin1", 12, 16);
    if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    return null;
  }
  // JPEG: walk the segments to the first start-of-frame marker.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const length = u16be(b, i + 2);
      const sof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (sof) return { width: u16be(b, i + 7), height: u16be(b, i + 5) };
      i += 2 + length;
    }
    return null;
  }
  // AVIF (ISO-BMFF): the first "ispe" box holds the image size.
  if (b.toString("latin1", 4, 8) === "ftyp") {
    const at = b.indexOf("ispe", 0, "latin1");
    if (at > 0 && at + 16 <= b.length) return { width: b.readUInt32BE(at + 8), height: b.readUInt32BE(at + 12) };
  }
  return null;
}

function read(filename: string): Dimensions | null {
  let fd: number | undefined;
  try {
    fd = openSync(uploadPath(filename), "r");
    const buffer = Buffer.alloc(HEAD_BYTES);
    const bytes = readSync(fd, buffer, 0, HEAD_BYTES, 0);
    const size = parse(buffer.subarray(0, bytes));
    return size && size.width > 0 && size.height > 0 ? size : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** Size of `/media/<file>`; null for other URLs or unreadable files. */
export function mediaDimensions(src: string | null | undefined): Dimensions | null {
  const file = src?.match(/^\/media\/([^/?#]+)$/)?.[1];
  if (!file || !STORED_NAME.test(file)) return null;
  if (!cache.has(file)) {
    const size = read(file);
    // A missing file isn't remembered, so an upload that appears later is still measured.
    if (!size) return null;
    cache.set(file, size);
  }
  return cache.get(file) ?? null;
}
