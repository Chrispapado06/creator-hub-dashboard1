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
     * OFFLINE BUILD ONLY — remove the Google Fonts links from index.html.
     *
     * `src/offline/offline.ts` closes every network path inside the app, but
     * `index.html` asks for Inter Tight and Instrument Serif before a line of
     * app code runs, and nothing in JavaScript can call that request back. So
     * an offline build strips the tags at build time and the app renders in the
     * fallback stacks that `src/index.css` already declares — which is what it
     * would have fallen back to anyway when the request failed, minus the
     * request. Self-hosting the two woff2 files is the real fix.
     *
     * Reads the environment variable directly because a Vite plugin runs in
     * Node, before `import.meta.env` exists. It is the same variable and the
     * same build; nothing here decides offline mode for the app itself. With
     * the variable unset this returns the HTML untouched.
     */
    {
      name: "icefall-offline-strip-webfonts",
      transformIndexHtml(html: string) {
        if (process.env.VITE_ICEFALL_OFFLINE !== "1") return html;
        return html.replace(/\s*<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, "");
      },
    },
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
            /*
             * THE HARVESTED FACTS AND THE PHOTOGRAPH INDEX — CACHED ON USE,
             * NOT PRECACHED, AND THE REASON IS SIZE.
             *
             * `data/peaks.json` is 4.7 MB for 53,668 peaks and IS precached,
             * because without it offline search collapses to the curated
             * fourteen. `data/peak-facts/{0..15}.json` hold the Wikidata
             * harvest for 33,000-odd entities — 6.1 MB raw between them,
             * sharded by entity id so one page costs one sixteenth. Precaching both would roughly double what installing the
             * app costs, to make prominence and mountain range available on a
             * peak page nobody has opened yet.
             *
             * So: the first visit to a reference peak fetches the facts, and
             * every visit after that works offline. A peak opened with no
             * signal and no cache still shows its elevation, position and
             * country — those live in `peaks.json` — and simply shows no
             * prominence row rather than an empty one. That is the honest
             * degradation the tier was designed around.
             *
             * `data/peak-photos.json` follows the same rule for the same
             * reason: it is one row per photographed peak across the world
             * set, not the 580-row Alpine index it started as. Until it has
             * loaded a card shows the contour plate, which claims nothing.
             */
            urlPattern: ({ url }) =>
              url.origin === self.location.origin &&
              (url.pathname.startsWith("/data/peak-facts/") ||
                url.pathname === "/data/peak-photos.json"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "icefall-peak-facts",
              // Sixteen fact shards plus the photograph index.
              expiration: { maxEntries: 20, maxAgeSeconds: 180 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            /*
             * THE ATHLETE'S OWN FACE, AND THIS RULE IS WHY IT SURVIVES NO
             * SIGNAL.
             *
             * `settings/hydrate.ts` fills `settings.avatar` and `settings.cover`
             * from `public.profiles`, and what the column holds is an https URL
             * into the public `profile-media` bucket rather than the data URL
             * the phone used to keep. Without this rule the profile screen would
             * fall back to an initial the first time the app opened offline —
             * the exact behaviour the local-first design exists to prevent.
             * CacheFirst: a profile picture that changed is worth showing a day
             * late, and a picture that is not there at all is not.
             */
            urlPattern:
              /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/profile-media\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "icefall-profile-media",
              expiration: { maxEntries: 60, maxAgeSeconds: 90 * 24 * 3600 },
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
    /*
     * 5190 is this app's own port and stays the default, so `npm run dev` in a
     * terminal behaves exactly as it always has and the docs stay true.
     *
     * PORT OVERRIDES IT. Several chats can have this repo open at once, and a
     * second one starting the same server hit "port 5190 is in use" with
     * `strictPort` refusing to move. When the harness assigns a port it passes
     * it as PORT, and `strictPort` is then dropped — pinning a port we were
     * told not to use is the whole failure.
     */
    port: Number(process.env.PORT) || 5190,
    strictPort: !process.env.PORT,
    // Bind to every interface so a phone on the same Wi-Fi can reach the dev
    // server. Note iOS treats http:// on a LAN IP as an insecure context, so
    // Geolocation and Wake Lock stay blocked there — the tracker needs HTTPS.
    host: true,
  },
});
