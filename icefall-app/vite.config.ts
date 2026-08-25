import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    /**
     * Offline support — the app has to open on a mountain with no signal.
     *
     * Workbox generates the precache manifest from the REAL build output, which
     * matters here: Vite emits content-hashed filenames and App.tsx code-splits
     * ~50 screens with React.lazy. A hand-written service worker would drift out
     * of sync with those hashes the first time anything changed, and an
     * unvisited route would fail to load offline.
     *
     * `manifest: false` — public/manifest.webmanifest is hand-tuned and stays
     * authoritative. `devOptions.enabled: false` — the SW is production-only, so
     * `npm run dev` is never served through a cache. Verify with
     * `npm run build && npm run preview`, never with the dev server.
     */
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false,
      devOptions: { enabled: false },
      workbox: {
        // The app shell: every hashed JS/CSS chunk (so lazy routes open
        // offline), plus the peak catalogue — without it, offline search
        // collapses from thousands of peaks to the 10 curated fallbacks.
        globPatterns: [
          "**/*.{js,css,html,woff2}",
          "data/peaks.json",
          "icon-*.png",
          "apple-touch-icon.png",
          "manifest.webmanifest",
        ],
        // The peak catalogue is large and unhashed; raise the cap so it is
        // precached rather than silently skipped.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // A deep link or refresh while offline resolves to the SPA shell,
        // mirroring the hosting rewrite.
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Bundled photography — 8 MB of hero JPGs. Cached on use rather
            // than precached, so installing the app stays light.
            urlPattern: ({ url, request }) =>
              url.origin === self.location.origin &&
              (request.destination === "image" || url.pathname.startsWith("/img/")),
            handler: "CacheFirst",
            options: {
              cacheName: "icefall-images",
              expiration: { maxEntries: 80, maxAgeSeconds: 90 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Map tiles + terrain DEM. Tiles already viewed replay offline;
            // anywhere never visited falls back to the procedural topo map.
            // Never precached — the planet is unbounded.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "icefall-map-tiles",
              expiration: { maxEntries: 1500, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "icefall-terrain-dem",
              expiration: { maxEntries: 800, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // The forecast: try the network briefly, then serve the last one
            // fetched. `conditions.ts` still reports honest absence when there
            // is nothing cached — it never invents calm weather.
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "icefall-conditions",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 40, maxAgeSeconds: 6 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Summit photography already has its own localStorage cache; this
            // keeps the image bytes too.
            urlPattern: /^https:\/\/upload\.wikimedia\.org\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "icefall-peak-photos",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5190,
    strictPort: true,
    // Bind to every interface so a phone on the same Wi-Fi can reach the dev
    // server. Note iOS treats http:// on a LAN IP as an insecure context, so
    // Geolocation and Wake Lock stay blocked there — the tracker needs HTTPS.
    host: true,
  },
});
