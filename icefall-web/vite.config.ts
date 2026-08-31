import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * OFFLINE DEMO — drop the webfont request from `index.html`.
 *
 * `index.html` links a RENDER-BLOCKING stylesheet at fonts.googleapis.com. With
 * no network the browser waits on it, logs a failure, and falls back to the
 * local stack anyway — so the request buys nothing and costs the first paint.
 * Typography is identical either way offline; only the waiting goes.
 *
 * Done here rather than in the page because `index.html` has no way to ask
 * whether the flag is set. The plugin is only ever added when it is: with
 * `VITE_ICEFALL_OFFLINE` unset the config object below is byte-for-byte the one
 * this file has always exported, and no deploy or CI build can reach this.
 */
function stripRemoteFonts(): Plugin {
  return {
    name: "icefall-offline-strip-remote-fonts",
    transformIndexHtml(html) {
      return html
        .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.[^"]*"[^>]*\/>/g, "")
        .replace(/\s*<link\b[^>]*fonts\.googleapis\.com[^>]*>/gs, "");
    },
  };
}

export default defineConfig(({ mode }) => {
  const offline = loadEnv(mode, __dirname, "").VITE_ICEFALL_OFFLINE === "1";

  return {
    plugins: [react(), tailwindcss(), ...(offline ? [stripRemoteFonts()] : [])],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    server: {
      port: 5194,
      strictPort: true,
      host: true,
      // Keys live on the API server; the browser only ever talks to /api.
      // If that server isn't running, report "not connected" cleanly (a 200 JSON)
      // instead of a proxy 500, so the demo-mode console stays clean. The app
      // falls back to its labelled demo data either way.
      proxy: {
        "/api": {
          target: "http://localhost:8788",
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on("error", (_err, _req, res) => {
              if (res && "writeHead" in res && !res.headersSent) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({ ok: false, connected: false, flights: "not_connected", stays: "not_connected" }),
                );
              }
            });
          },
        },
      },
    },
  };
});
