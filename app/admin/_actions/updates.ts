"use server";

import { z } from "zod";
import { authorize } from "@/lib/auth/dal";
import { canEncrypt, encryptSecret } from "@/lib/crypto";
import { CHECK_EVERY_MS, REPO_PATTERN, checkForUpdates, readUpdates, toUpdatesView, writeUpdates, type UpdatesView } from "@/lib/updates";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const sourceSchema = z.object({
  repo: z
    .string()
    .trim()
    .transform((v) => v.replace(/^https:\/\/github\.com\//i, "").replace(/(\.git)?\/*$/i, ""))
    .refine((v) => REPO_PATTERN.test(v), "Tulis repositori sebagai pemilik/nama, mis. teknik-github/DocsKu."),
  token: z.string().trim().max(400),
  clearToken: z.boolean().optional(),
});

/** Saves where releases come from (and the token for a private repository), then checks right away. */
export async function saveUpdateSource(input: z.input<typeof sourceSchema>): Promise<Result<{ view: UpdatesView }>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { repo, token, clearToken } = parsed.data;

  const stored = await readUpdates();
  const next = { ...stored, repo };
  // A token is only ever sent to the repository it was entered for.
  if (clearToken || repo !== stored.repo) {
    delete next.tokenEncrypted;
    delete next.tokenHint;
  }
  if (token) {
    if (!canEncrypt()) return { ok: false, error: "ENCRYPTION_KEY belum diatur, jadi token tidak bisa disimpan. Isi UPDATE_GITHUB_TOKEN di env sebagai gantinya." };
    next.tokenEncrypted = encryptSecret(token);
    next.tokenHint = `…${token.slice(-4)}`;
  }
  delete next.check;
  await writeUpdates(next);
  await checkForUpdates();
  return { ok: true, view: toUpdatesView(await readUpdates()) };
}

/** Checks GitHub for releases. With `ifStale`, only when the last check is old (or from another build). */
export async function checkUpdates(options: { ifStale?: boolean } = {}): Promise<Result<{ view: UpdatesView }>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const stored = await readUpdates();
  const last = stored.check ? Date.parse(stored.check.at) : 0;
  if (!options.ifStale || Date.now() - last > CHECK_EVERY_MS || stored.check?.repo !== stored.repo) await checkForUpdates();
  return { ok: true, view: toUpdatesView(await readUpdates()) };
}
