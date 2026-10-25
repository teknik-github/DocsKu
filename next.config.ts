import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// `next dev -H 0.0.0.0` is reachable over the network, but Next.js blocks dev
// resources (HMR, client chunks) for any origin other than localhost, so the
// page never hydrates. Allow this machine's own IPs plus any extra hostnames
// listed in DEV_ORIGINS (comma-separated), e.g. DEV_ORIGINS=docs.example.test.
const localIps = Object.values(networkInterfaces())
  .flat()
  .filter((iface) => iface?.family === "IPv4")
  .map((iface) => iface!.address);
const extraOrigins = (process.env.DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * Security headers for every response. Only frame-ancestors is set from CSP:
 * a full script policy would need nonces for Next.js and the theme script.
 */
const securityHeaders = [
  // Nobody may put the site (or the dashboard) in a frame: blocks clickjacking.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone for the Docker image (see Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  allowedDevOrigins: [...localIps, ...extraOrigins],
  poweredByHeader: false,
  experimental: {
    // When an AI agent runs next dev/build, stop once if this Next.js has a known security advisory.
    agentUpgrade: "security",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Uploaded files are served as passive images only (the later rule wins for the same key).
      { source: "/media/:file*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
      {
        // HSTS only means something over HTTPS, i.e. behind a TLS-terminating proxy.
        source: "/:path*",
        has: [{ type: "header", key: "x-forwarded-proto", value: "https" }],
        headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
