import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

/**
 * OFFLINE ONLY — drop the remote webfont request.
 *
 * `src/index.css` opens with an `@import` of Google Fonts. It is the one thing
 * in this app that reaches the network from CSS, and offline it is the worst
 * kind of request to leave in: a stylesheet import blocks first paint until it
 * fails, and on a laptop holding a wifi association with no route that failure
 * can take tens of seconds. A demo that opens on a white screen is not a demo.
 *
 * So it is removed from the SOURCE, at build time, and only when the offline
 * flag is set. The production CSS file is untouched and this plugin is not in
 * the plugin array at all unless `VITE_ICEFALL_OFFLINE=1` — with the flag unset
 * nothing here runs and the fonts load exactly as they always have. The
 * fallback stacks in `index.css` (`ui-sans-serif`/`system-ui`, Georgia for the
 * serif) are what the offline build renders in.
 */
const REMOTE_FONT_IMPORT = /@import\s+url\(\s*["']?https:\/\/fonts\.googleapis\.com[^)]*\)\s*;?/g;

function stripRemoteFonts(): Plugin {
  return {
    name: "icefall-offline-strip-remote-fonts",
    enforce: "pre",
    transform(code: string, id: string) {
      // Vite ids carry query suffixes (`?direct`, `?used`) — match on the file.
      const file = id.split("?")[0] ?? "";
      if (!file.endsWith(".css")) return null;
      if (!REMOTE_FONT_IMPORT.test(code)) return null;
      // `test` on a /g regex advances lastIndex — reset before replacing.
      REMOTE_FONT_IMPORT.lastIndex = 0;
      return { code: code.replace(REMOTE_FONT_IMPORT, ""), map: null };
    },
  };
}

const OFFLINE = process.env.VITE_ICEFALL_OFFLINE === "1";

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(OFFLINE ? [stripRemoteFonts()] : [])],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 5196, strictPort: true, host: true },
});
