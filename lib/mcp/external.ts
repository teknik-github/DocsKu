import "server-only";
import { createHash } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import type { ToolSpec } from "@/lib/ai/client";

/**
 * External MCP servers the AI Chat agent may use (settings key "mcp_servers",
 * managed by admins under MCP). Only remote Streamable HTTP servers: running
 * local stdio processes from a web app is not offered. The tool list is
 * fetched when an admin refreshes a server and stored, so chats don't connect
 * just to list tools and the tool definitions stay byte-stable for prompt caching.
 */

export type StoredMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The server marked the tool read-only (annotations.readOnlyHint). */
  readOnly: boolean;
  enabled: boolean;
};

export type StoredMcpServer = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  /** Extra request headers (e.g. Authorization), AES-GCM encrypted JSON; see lib/crypto.ts. */
  headersEncrypted?: string;
  /** Names of the stored headers, shown in the dashboard instead of their values. */
  headerNames: string[];
  tools: StoredMcpTool[];
  checkedAt?: string;
};

/** What the dashboard may see of a server: everything except the header values. */
export type McpServerView = Omit<StoredMcpServer, "headersEncrypted">;

export function toServerView(server: StoredMcpServer): McpServerView {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    enabled: server.enabled,
    headerNames: server.headerNames,
    tools: server.tools,
    checkedAt: server.checkedAt,
  };
}

const KEY = "mcp_servers";
const TIMEOUT_MS = 30_000;
const MAX_RESULT_CHARS = 20_000;

export async function readMcpServers(): Promise<StoredMcpServer[]> {
  const [row] = await db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, KEY));
  return (row?.value as StoredMcpServer[] | undefined) ?? [];
}

export async function writeMcpServers(servers: StoredMcpServer[]) {
  await db
    .insert(schema.settings)
    .values({ key: KEY, value: servers })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: servers } });
}

export function decryptHeaders(server: Pick<StoredMcpServer, "headersEncrypted">): Record<string, string> {
  if (!server.headersEncrypted) return {};
  const plain = decryptSecret(server.headersEncrypted);
  return plain ? (JSON.parse(plain) as Record<string, string>) : {};
}

async function connect(url: string, headers: Record<string, string>) {
  const client = new Client({ name: "docsku", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
  await client.connect(transport, { timeout: TIMEOUT_MS });
  return client;
}

/** Connects and lists every tool (following pagination). */
export async function fetchTools(url: string, headers: Record<string, string>) {
  const client = await connect(url, headers);
  try {
    const tools: Omit<StoredMcpTool, "enabled">[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: TIMEOUT_MS });
      for (const tool of page.tools) {
        tools.push({
          name: tool.name,
          title: tool.title ?? tool.annotations?.title,
          description: (tool.description ?? "").slice(0, 2000),
          inputSchema: tool.inputSchema as Record<string, unknown>,
          readOnly: tool.annotations?.readOnlyHint === true,
        });
      }
      cursor = page.nextCursor;
    } while (cursor && tools.length < 500);
    return tools;
  } finally {
    await client.close().catch(() => {});
  }
}

/** Function name the model sees: mcp_<server>_<tool>, at most 64 characters of [A-Za-z0-9_-]. */
function functionName(server: StoredMcpServer, tool: string) {
  const clean = (text: string) => text.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const name = `mcp_${clean(server.name).slice(0, 20) || "server"}_${clean(tool)}`;
  if (name.length <= 64) return name;
  const suffix = createHash("sha256").update(`${server.id}:${tool}`).digest("hex").slice(0, 8);
  return `${name.slice(0, 55)}_${suffix}`;
}

export type ExternalTools = {
  specs: ToolSpec[];
  /** The server and tool behind a function name the model called. */
  lookup: Map<string, { server: StoredMcpServer; tool: StoredMcpTool }>;
};

/** Enabled tools of enabled servers, as function specs for the agent. */
export async function externalAgentTools(): Promise<ExternalTools> {
  const lookup: ExternalTools["lookup"] = new Map();
  const specs: ToolSpec[] = [];
  for (const server of await readMcpServers()) {
    if (!server.enabled) continue;
    for (const tool of server.tools) {
      if (!tool.enabled) continue;
      const name = functionName(server, tool.name);
      if (lookup.has(name)) continue;
      lookup.set(name, { server, tool });
      specs.push({
        type: "function",
        function: {
          name,
          description: `[MCP · ${server.name}] ${tool.description || tool.title || tool.name}`.slice(0, 1024),
          parameters: tool.inputSchema?.type === "object" ? tool.inputSchema : { type: "object", properties: {} },
        },
      });
    }
  }
  return { specs, lookup };
}

/** Calls an external tool and returns its result as text for the model. */
export async function callExternalTool(server: StoredMcpServer, tool: string, args: Record<string, unknown>, signal?: AbortSignal) {
  const client = await connect(server.url, decryptHeaders(server));
  try {
    const result = await client.callTool({ name: tool, arguments: args }, { timeout: TIMEOUT_MS, signal });
    const parts: string[] = [];
    for (const block of (result.content ?? []) as { type: string; text?: string; uri?: string; resource?: { uri?: string; text?: string } }[]) {
      if (block.type === "text" && block.text) parts.push(block.text);
      else if (block.type === "resource" && block.resource) parts.push(block.resource.text ?? `[resource ${block.resource.uri ?? ""}]`);
      else if (block.type === "resource_link") parts.push(`[resource ${block.uri ?? ""}]`);
      else parts.push(`[${block.type}]`);
    }
    if (!parts.length && result.structuredContent) parts.push(JSON.stringify(result.structuredContent));
    const text = parts.join("\n\n") || "(tidak ada hasil)";
    return { ok: !result.isError, text: text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n…(dipotong)` : text };
  } finally {
    await client.close().catch(() => {});
  }
}
