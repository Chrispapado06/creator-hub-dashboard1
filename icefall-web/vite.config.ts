import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
              res.end(JSON.stringify({ ok: false, connected: false, flights: "not_connected", stays: "not_connected" }));
            }
          });
        },
      },
    },
  },
});
