import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * THE ONE THING OFFLINE MODE CANNOT FIX FROM INSIDE THE APP.
 *
 * `index.html` links the Google Fonts stylesheet, and a stylesheet in `<head>`
 * blocks the first paint until it loads OR fails. On a plane the laptop is
 * usually associated with a wifi network that has no route to anywhere, so that
 * request does not fail fast — it hangs on DNS, and the whole app is a blank
 * frame while it does. No amount of `if (OFFLINE)` inside React can prevent a
 * request the browser makes before React exists.
 *
 * So an offline build drops the three font tags at build time. The type falls
 * back to the stacks `src/index.css` already declares (`ui-sans-serif`,
 * `ui-serif`, Georgia), which is why they are there. The app looks a little less
 * designed and appears instantly, which is the right way round for a demo
 * somebody has to be able to open.
 *
 * WITH THE FLAG UNSET THIS PLUGIN IS NOT INSTALLED AT ALL and the config is the
 * one that was here before — same plugins, same alias, same server block.
 */
function stripRemoteFonts(): Plugin {
  return {
    name: "icefall-offline-strip-remote-fonts",
    transformIndexHtml(html) {
      return html
        .replace(/\n?[ \t]*<link[^>]*rel="preconnect"[^>]*fonts\.[a-z]+\.com[^>]*>/g, "")
        .replace(/\n?[ \t]*<link[^>]*fonts\.googleapis\.com[^>]*>/g, "");
    },
  };
}

export default defineConfig(({ mode }) => {
  /* `loadEnv` rather than `process.env`, so the flag works whether it is given
     on the command line or written into a `.env.local`. */
  const env = loadEnv(mode, process.cwd(), "");
  const offline = env.VITE_ICEFALL_OFFLINE === "1";

  return {
    plugins: [react(), tailwindcss(), ...(offline ? [stripRemoteFonts()] : [])],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    server: { port: 5193, strictPort: true, host: true },
  };
});
