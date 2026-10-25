import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import packageJson from "@/package.json";

/**
 * "Is there a newer Docsku?" Versions are the GitHub releases (tags vX.Y.Z)
 * of the source repository; `pnpm release` makes them. The installed version
 * is package.json's, baked in at build time. Nothing is installed from here:
 * the dashboard shows the release notes and the commands to run on the server.
 */

export const CURRENT_VERSION: string = packageJson.version;
export const DEFAULT_REPO = process.env.UPDATE_REPO || "teknik-github/DocsKu";
export const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
/** How old a check may get before the dashboard runs a new one. */
export const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;

export type Release = { version: string; tag: string; name: string; notes: string; url: string; publishedAt: string | null };
export type UpdateCheck =
  | { at: string; ok: true; repo: string; latest: Release | null; newer: Release[] }
  | { at: string; ok: false; repo: string; error: string };

/** Stored under settings.key = "updates". The token is encrypted (lib/crypto.ts). */
export type StoredUpdates = { repo: string; tokenEncrypted?: string; tokenHint?: string; check?: UpdateCheck };

/** What the dashboard may see: no token, only whether one is set. */
export type UpdatesView = {
  current: string;
  repo: string;
  hasToken: boolean;
  tokenHint: string | null;
  tokenFromEnv: boolean;
  check: UpdateCheck | null;
};

export async function readUpdates(): Promise<StoredUpdates> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, "updates"));
  return { repo: DEFAULT_REPO, ...(row?.value as Partial<StoredUpdates> | undefined) };
}

export async function writeUpdates(value: StoredUpdates) {
  await db
    .insert(schema.settings)
    .values({ key: "updates", value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

export function toUpdatesView(stored: StoredUpdates): UpdatesView {
  const tokenFromEnv = Boolean(process.env.UPDATE_GITHUB_TOKEN);
  return {
    current: CURRENT_VERSION,
    repo: stored.repo,
    hasToken: tokenFromEnv || Boolean(stored.tokenEncrypted),
    tokenHint: tokenFromEnv ? null : (stored.tokenHint ?? null),
    tokenFromEnv,
    // Stored by a possibly older build: keep only releases newer than the one running now.
    check: stored.check?.ok
      ? { ...stored.check, newer: stored.check.newer.filter((r) => compareVersions(r.version, CURRENT_VERSION) > 0) }
      : (stored.check ?? null),
  };
}

/** Whether the last stored check found a newer release than the running build. */
export function hasUpdate(stored: StoredUpdates) {
  return Boolean(stored.check?.ok && stored.check.latest && compareVersions(stored.check.latest.version, CURRENT_VERSION) > 0);
}

/** "v1.2.3" → [1, 2, 3]; null for anything else (pre-releases like 1.2.0-rc.1 are skipped). */
function parseVersion(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(a: string, b: string) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

type GitHubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
};

const MAX_NOTES = 20_000;

/** Asks GitHub for the repository's releases and stores the result. */
export async function checkForUpdates(): Promise<UpdateCheck> {
  const stored = await readUpdates();
  const repo = stored.repo;
  const at = new Date().toISOString();
  const token = process.env.UPDATE_GITHUB_TOKEN || (stored.tokenEncrypted ? decryptSecret(stored.tokenEncrypted) : null);
  let check: UpdateCheck;
  try {
    if (!REPO_PATTERN.test(repo)) throw new Error("Nama repositori tidak valid.");
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": `docsku/${CURRENT_VERSION}`,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (response.status === 404) {
      throw new Error(token ? "Repositori tidak ditemukan, atau token tidak punya akses ke repositori ini." : "Repositori tidak ditemukan. Repositori private butuh token GitHub.");
    }
    if (response.status === 401) throw new Error("Token GitHub ditolak (tidak valid atau kedaluwarsa).");
    if (response.status === 403 || response.status === 429) throw new Error("GitHub membatasi permintaan. Coba lagi nanti, atau pasang token.");
    if (!response.ok) throw new Error(`GitHub menjawab ${response.status}.`);
    const releases = ((await response.json()) as GitHubRelease[])
      .filter((r) => !r.draft && !r.prerelease && parseVersion(r.tag_name))
      .map(
        (r): Release => ({
          version: r.tag_name.replace(/^v/, ""),
          tag: r.tag_name,
          name: r.name || r.tag_name,
          notes: (r.body ?? "").slice(0, MAX_NOTES),
          // Only ever link to GitHub.
          url: r.html_url.startsWith("https://github.com/") ? r.html_url : `https://github.com/${repo}/releases`,
          publishedAt: r.published_at,
        }),
      )
      .sort((a, b) => compareVersions(b.version, a.version));
    check = {
      at,
      ok: true,
      repo,
      latest: releases[0] ?? null,
      newer: releases.filter((r) => compareVersions(r.version, CURRENT_VERSION) > 0).slice(0, 10),
    };
  } catch (error) {
    const message = error instanceof Error && error.name !== "TimeoutError" && !/fetch failed/i.test(error.message) ? error.message : "Tidak bisa menghubungi GitHub.";
    check = { at, ok: false, repo, error: message };
  }
  await writeUpdates({ ...stored, check });
  return check;
}
