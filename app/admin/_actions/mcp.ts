"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { authorize } from "@/lib/auth/dal";
import { canEncrypt, encryptSecret } from "@/lib/crypto";
import {
  decryptHeaders,
  fetchTools,
  readMcpServers,
  toServerView,
  writeMcpServers,
  type McpServerView,
  type StoredMcpServer,
} from "@/lib/mcp/external";
import { isMcpScope } from "@/lib/mcp/scopes";
import { issueToken } from "@/lib/mcp/tokens";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ---- Personal API tokens (any signed-in user, for their own account) ----

const tokenSchema = z.object({
  name: z.string().trim().min(1, "Beri nama token, mis. Claude Desktop.").max(60),
  scopes: z.array(z.string().refine(isMcpScope)).min(1, "Pilih minimal satu izin."),
  /** Days until it expires; null never expires. */
  days: z.number().int().min(1).max(3650).nullable(),
});

/** Creates a token; the value is returned once and cannot be shown again. */
export async function createApiToken(input: z.input<typeof tokenSchema>): Promise<Result<{ token: string }>> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = tokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const scopes = [...new Set(parsed.data.scopes.filter(isMcpScope))];
  const expiresAt = parsed.data.days ? new Date(Date.now() + parsed.data.days * 86_400_000) : null;
  const { token } = await issueToken(user.id, parsed.data.name, scopes, expiresAt);
  return { ok: true, token };
}

/** Revokes one of the user's own tokens (admins may revoke anyone's). */
export async function revokeApiToken(id: string): Promise<Result> {
  const user = await authorize();
  if ("error" in user) return { ok: false, error: user.error };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Token tidak ditemukan." };
  const where =
    user.role === "admin" ? eq(schema.apiTokens.id, id) : and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, user.id));
  const [deleted] = await db.delete(schema.apiTokens).where(where).returning({ id: schema.apiTokens.id });
  return deleted ? { ok: true } : { ok: false, error: "Token tidak ditemukan." };
}

// ---- External MCP servers for AI Chat (admins only) ----

const serverSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Beri nama server.").max(40),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => /^https?:\/\/[^\s]+$/i.test(v), "Alamat harus diawali http:// atau https://"),
  /** One optional header such as Authorization. Empty value keeps the stored one. */
  headerName: z
    .string()
    .trim()
    .max(100)
    .refine((v) => v === "" || /^[A-Za-z0-9-]+$/.test(v), "Nama header tidak valid."),
  headerValue: z.string().trim().max(4000),
  clearHeaders: z.boolean().optional(),
});

export type McpServerForm = z.input<typeof serverSchema>;


/**
 * Adds or updates a server, then connects to fetch its tools. Known tools keep
 * their on/off choice; new ones start enabled only if the server marks them read-only.
 */
export async function saveMcpServer(input: McpServerForm): Promise<Result<{ server: McpServerView }>> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = serverSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const form = parsed.data;

  const servers = await readMcpServers();
  const existing = form.id ? servers.find((s) => s.id === form.id) : undefined;
  if (form.id && !existing) return { ok: false, error: "Server tidak ditemukan." };

  // Stored secrets only go back to the origin they were entered for; a changed URL must re-enter them.
  const sameOrigin = existing && new URL(existing.url).origin === new URL(form.url).origin;
  let headers = sameOrigin && !form.clearHeaders ? decryptHeaders(existing) : {};
  if (form.headerName && form.headerValue) {
    if (!canEncrypt()) return { ok: false, error: "ENCRYPTION_KEY belum diatur, jadi header rahasia tidak bisa disimpan." };
    headers = { ...headers, [form.headerName]: form.headerValue };
  }

  let tools;
  try {
    tools = await fetchTools(form.url, headers);
  } catch (error) {
    return { ok: false, error: `Tidak bisa terhubung atau membaca daftar tool: ${(error as Error).message}` };
  }
  const previous = new Map(existing?.tools.map((tool) => [tool.name, tool.enabled]));
  const server: StoredMcpServer = {
    id: existing?.id ?? randomUUID(),
    name: form.name,
    url: form.url,
    enabled: existing?.enabled ?? true,
    headersEncrypted: Object.keys(headers).length ? encryptSecret(JSON.stringify(headers)) : undefined,
    headerNames: Object.keys(headers),
    tools: tools.map((tool) => ({ ...tool, enabled: previous.get(tool.name) ?? tool.readOnly })),
    checkedAt: new Date().toISOString(),
  };
  await writeMcpServers(existing ? servers.map((s) => (s.id === server.id ? server : s)) : [...servers, server]);
  return { ok: true, server: toServerView(server) };
}

const toggleSchema = z.object({ id: z.uuid(), enabled: z.boolean(), tool: z.string().max(200).optional() });

/** Turns a whole server, or one of its tools, on or off for AI Chat. */
export async function setMcpEnabled(input: z.input<typeof toggleSchema>): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Permintaan tidak valid." };
  const { id, enabled, tool } = parsed.data;
  const servers = await readMcpServers();
  const server = servers.find((s) => s.id === id);
  if (!server || (tool && !server.tools.some((t) => t.name === tool))) return { ok: false, error: "Tidak ditemukan." };
  await writeMcpServers(
    servers.map((s) =>
      s.id !== id ? s : tool ? { ...s, tools: s.tools.map((t) => (t.name === tool ? { ...t, enabled } : t)) } : { ...s, enabled },
    ),
  );
  return { ok: true };
}

export async function deleteMcpServer(id: string): Promise<Result> {
  const user = await authorize("admin");
  if ("error" in user) return { ok: false, error: user.error };
  const servers = await readMcpServers();
  if (!servers.some((s) => s.id === id)) return { ok: false, error: "Server tidak ditemukan." };
  await writeMcpServers(servers.filter((s) => s.id !== id));
  return { ok: true };
}
