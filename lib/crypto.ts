import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for secrets stored in the database. The key comes from
 * ENCRYPTION_KEY; changing it makes previously stored secrets unreadable.
 */
function key() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) return null;
  return createHash("sha256").update(secret).digest();
}

export const canEncrypt = () => key() !== null;

/** Returns `iv.tag.ciphertext` in base64url. */
export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("ENCRYPTION_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(sealed: string): string | null {
  const k = key();
  const [iv, tag, data] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!k || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", k, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
