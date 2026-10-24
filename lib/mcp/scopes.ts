/** Rights an MCP API token can carry. Safe to import anywhere. */
export const MCP_SCOPES = [
  { id: "read", label: "Baca", description: "Cari dan baca halaman (termasuk draf) serta struktur navigasi." },
  { id: "write", label: "Tulis draf", description: "Membuat halaman baru dan mengubah draf. Tidak menerbitkan." },
  { id: "publish", label: "Terbitkan", description: "Menerbitkan, menjadwalkan, dan menarik halaman dari situs." },
] as const;

export type McpScope = (typeof MCP_SCOPES)[number]["id"];

export const isMcpScope = (value: string): value is McpScope => MCP_SCOPES.some((scope) => scope.id === value);

/** Token format: "dk_" + 43 base64url characters (32 random bytes). */
export const TOKEN_PATTERN = /^dk_[A-Za-z0-9_-]{43}$/;
