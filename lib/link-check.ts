import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Server-side check of external links found in published content (Tinjauan →
 * "Periksa tautan luar"). Only http(s) URLs without credentials; every hop's
 * address is resolved and refused when it is private, loopback, link-local or
 * otherwise not public (the check runs inside the connection's DNS lookup, so
 * a name can't resolve to a public address first and a private one later).
 */

const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const CONCURRENCY = 4;
export const MAX_URLS_PER_RUN = 200;
/** A run stops starting new checks after this long and reports the rest as left over. */
const RUN_BUDGET_MS = 90_000;

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

/** Whether an IP literal may be contacted. IPv4-mapped and NAT64 (DNS64) addresses are judged by their IPv4 part. */
export function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);
  // NAT64 (64:ff9b::/96, used by DNS64 resolvers): judge the IPv4 address inside.
  const nat64 = /^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (nat64) {
    const [hi, lo] = [parseInt(nat64[1], 16), parseInt(nat64[2], 16)];
    return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (/^64:ff9b::/i.test(address)) return false;
  const family = isIP(address);
  if (!family) return false;
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

class BlockedAddress extends Error {}

/** DNS lookup for http(s).request that refuses non-public addresses. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as LookupAddress[];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (bad || !list.length) return callback(new BlockedAddress(`Alamat ${bad?.address ?? hostname} tidak publik`), "", 0);
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export type CheckResult = { ok: boolean; status: number | null; error: string | null };

/** Refuses anything that isn't a plain public http(s) URL, before any network access. */
export function urlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "URL tidak valid";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Hanya http/https";
  if (url.username || url.password) return "URL berisi kredensial";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) return `Alamat ${host} tidak publik`;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return "Nama host lokal";
  return null;
}

function request(url: URL, method: "HEAD" | "GET"): Promise<{ status: number; location: string | null }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method,
        lookup: guardedLookup,
        timeout: TIMEOUT_MS,
        headers: { "user-agent": "DocskuLinkChecker/1.0", accept: "*/*" },
        // A fresh connection each time, so the guarded lookup always runs.
        agent: false,
      },
      (res) => {
        resolve({ status: res.statusCode ?? 0, location: typeof res.headers.location === "string" ? res.headers.location : null });
        res.destroy();
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("Waktu habis")), TIMEOUT_MS);
    req.on("timeout", () => req.destroy(new Error("Waktu habis")));
    req.on("error", reject);
    req.on("close", () => clearTimeout(timer));
    req.end();
  });
}

/** HEAD (GET when HEAD isn't allowed), following up to MAX_REDIRECTS redirects, each hop re-checked. */
export async function checkUrl(raw: string): Promise<CheckResult> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const problem = urlProblem(current);
    if (problem) return { ok: false, status: null, error: problem };
    const url = new URL(current);
    try {
      let res = await request(url, "HEAD");
      if (res.status === 405 || res.status === 501 || res.status === 400 || res.status === 404 || res.status === 403) {
        // Some servers answer HEAD badly; confirm with GET (headers only).
        res = await request(url, "GET");
      }
      if (res.status >= 300 && res.status < 400 && res.location) {
        current = new URL(res.location, url).toString();
        continue;
      }
      return { ok: res.status >= 200 && res.status < 400, status: res.status, error: null };
    } catch (error) {
      const message = error instanceof BlockedAddress ? error.message : error instanceof Error ? error.message || "Gagal terhubung" : "Gagal terhubung";
      return { ok: false, status: null, error: message.slice(0, 200) };
    }
  }
  return { ok: false, status: null, error: `Lebih dari ${MAX_REDIRECTS} pengalihan` };
}

let running = false;

/**
 * Checks the given URLs (never-checked and oldest first, at most
 * MAX_URLS_PER_RUN) and stores each result in `link_checks`.
 * One run at a time per server.
 */
export async function checkExternalLinks(urls: string[], lastChecked: Map<string, number>) {
  if (running) return { busy: true as const };
  running = true;
  try {
    const queue = [...new Set(urls)].sort((a, b) => (lastChecked.get(a) ?? 0) - (lastChecked.get(b) ?? 0)).slice(0, MAX_URLS_PER_RUN);
    const started = Date.now();
    let checked = 0;
    let broken = 0;
    let index = 0;
    const worker = async () => {
      while (index < queue.length && Date.now() - started < RUN_BUDGET_MS) {
        const url = queue[index++];
        const result = await checkUrl(url);
        checked++;
        if (!result.ok) broken++;
        await db
          .insert(schema.linkChecks)
          .values({ url, ...result })
          .onConflictDoUpdate({ target: schema.linkChecks.url, set: { ok: result.ok, status: result.status, error: result.error, checkedAt: sql`now()` } });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return { busy: false as const, checked, broken, remaining: Math.max(0, urls.length - checked) };
  } finally {
    running = false;
  }
}
