/**
 * Author profiles: the public side of a team member (name, photo, job title,
 * bio, links, and the /penulis/<username> page). Plain module, shared by the
 * server, the dashboard forms and the public components. Email is never part
 * of a public author.
 */

export type AuthorLink = { label: string; url: string };

export type PublicAuthor = {
  id: string;
  name: string;
  /** Slug of /penulis/<username>; null = no public author page. */
  username: string | null;
  avatar: string | null;
  jobTitle: string | null;
  bio: string | null;
  links: AuthorLink[];
};

export const USERNAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 40;
export const BIO_MAX = 300;
export const JOB_TITLE_MAX = 80;
export const MAX_LINKS = 4;
/** Profile photos are shown small; keep uploads light. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Words that read like site pages or roles rather than people. */
const RESERVED = new Set([
  "admin", "administrator", "api", "docs", "dokumentasi", "penulis", "author", "authors", "internal", "media", "preview",
  "widget", "login", "masuk", "keluar", "logout", "root", "system", "sistem", "support", "bantuan", "tim", "team", "null", "undefined",
]);

/** Error message for a username, or null when it can be used (uniqueness is checked on the server). */
export function usernameError(value: string): string | null {
  if (value.length < USERNAME_MIN) return `Minimal ${USERNAME_MIN} karakter.`;
  if (value.length > USERNAME_MAX) return `Maksimal ${USERNAME_MAX} karakter.`;
  if (!USERNAME.test(value)) return "Hanya huruf kecil a–z, angka, dan tanda hubung (tidak di awal/akhir).";
  if (RESERVED.has(value)) return "Nama ini dipakai sistem. Pilih yang lain.";
  return null;
}

/** "Moch Raffi" → "moch-raffi" (accents dropped), trimmed to the maximum length. */
export function suggestUsername(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, USERNAME_MAX)
    .replace(/-+$/, "");
}

export const authorHref = (username: string) => `/penulis/${username}`;

/** A photo URL we render: an upload (/media/…) or https. */
export const isAvatarUrl = (value: string) => /^\/media\/[\w.-]+$/.test(value) || /^https:\/\/[^\s"'<>]+$/i.test(value);

/** "Moch Raffi" → "MR"; one word → its first two letters. */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
