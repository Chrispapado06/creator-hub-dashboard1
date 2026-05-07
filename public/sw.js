// Agency Console — minimal service worker.
//
// Strategy: network-first. We cache the app shell + static assets so the page
// loads instantly when the network is slow or offline. API calls (Supabase,
// Reddit proxy, Anthropic) bypass the cache entirely so data is always fresh.
//
// To bump after a deploy: change CACHE_NAME and the old caches will be
// pruned in the activate step.

const CACHE_NAME = "agency-console-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Use addAll loosely — if any single asset 404s, don't fail the install.
      await Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch(() => undefined)),
      );
      // Activate the new worker immediately on install
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Don't cache requests to these origins / paths — they're live data.
function shouldBypass(url) {
  if (url.hostname.includes("supabase")) return true;
  if (url.hostname.includes("anthropic")) return true;
  if (url.hostname.includes("airtable")) return true;
  if (url.hostname.includes("onlyfansapi")) return true;
  if (url.pathname.startsWith("/reddit-api")) return true;
  if (url.pathname.startsWith("/api")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  let url;
  try { url = new URL(event.request.url); }
  catch { return; }
  if (shouldBypass(url)) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(event.request);
        // Only cache successful, same-origin responses to keep the cache tidy.
        if (url.origin === self.location.origin && fresh.ok && fresh.type !== "opaque") {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, fresh.clone()).catch(() => undefined);
        }
        return fresh;
      } catch {
        // Network failed — fall back to cache, or to the app shell for nav requests
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return Response.error();
      }
    })(),
  );
});
