/**
 * The service worker behind "baca offline" (registered by components/pwa-register.tsx
 * on the public site). Plain JS, served from the root so its scope is the whole site.
 *
 * - Pages readers open (/, /docs…, /terbaru, /glosarium, /penulis…, language homes):
 *   network first (4 s), the copy is kept; offline, the kept copy is served, else a
 *   small offline page. Responses marked no-store or private (internal articles) are never kept.
 * - /_next/static: cache first (file names change with every build).
 * - /media: stale-while-revalidate, at most MEDIA_LIMIT files.
 * - Everything else (dashboard, API, previews, widget) goes straight to the network.
 */

const VERSION = process.env.NEXT_DEPLOYMENT_ID || "1";

const script = `
const VERSION = ${JSON.stringify(VERSION)};
const PAGES = "docsku-pages-" + VERSION;
const STATIC = "docsku-static-" + VERSION;
const MEDIA = "docsku-media-" + VERSION;
const PAGE_LIMIT = 60;
const MEDIA_LIMIT = 80;
const SKIP = /^\\/(admin|api|preview|widget|_\\/|pdf|cover|sw\\.js)/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("docsku-") && !key.endsWith("-" + VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function trim(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}

function keepable(response) {
  if (!response || response.status !== 200 || response.type !== "basic") return false;
  const control = response.headers.get("cache-control") || "";
  return !/no-store|private/i.test(control);
}

function offlinePage() {
  const html = '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sedang offline</title>'
    + '<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#faf9f5;color:#1f1e1d;text-align:center;padding:24px}'
    + 'p{color:#6b6a66;max-width:28rem}a{color:inherit}</style></head><body><main><h1>Sedang offline</h1>'
    + '<p>Halaman ini belum pernah dibuka di perangkat ini, jadi belum tersedia tanpa internet. Halaman yang sudah pernah Anda baca tetap bisa dibuka.</p>'
    + '<p><a href="/docs">Coba buka dokumentasi</a></p></main></body></html>';
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    if (keepable(response)) {
      await cache.put(request.url.split("#")[0], response.clone());
      trim(PAGES, PAGE_LIMIT);
    }
    return response;
  } catch (error) {
    const kept = await cache.match(request.url.split("#")[0], { ignoreSearch: false });
    return kept || offlinePage();
  }
}

async function staticFile(request) {
  const cache = await caches.open(STATIC);
  const kept = await cache.match(request);
  if (kept) return kept;
  const response = await fetch(request);
  if (keepable(response) || (response.status === 200 && response.type === "basic")) cache.put(request, response.clone());
  return response;
}

async function media(request) {
  const cache = await caches.open(MEDIA);
  const kept = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.status === 200 && response.type === "basic") {
        cache.put(request, response.clone());
        trim(MEDIA, MEDIA_LIMIT);
      }
      return response;
    })
    .catch(() => kept);
  return kept || fresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || SKIP.test(url.pathname)) return;
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(staticFile(request));
  if (url.pathname.startsWith("/media/")) return event.respondWith(media(request));
  // Full page loads only; client-side navigations (RSC) fall back to one when the network is gone.
  if (request.mode === "navigate") return event.respondWith(page(request));
});
`;

export function GET() {
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
