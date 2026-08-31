import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * OFFLINE BUILDS DO NOT ASK GOOGLE FOR FONTS.
 *
 * `index.html` links Plus Jakarta Sans and Instrument Serif from
 * fonts.googleapis.com. With no network those three requests hang and then fail
 * — harmlessly, since both families have real local fallbacks — but "zero
 * network calls leave the app" is the offline contract, and a failing request
 * is still a request. Stripping the tags is the only way to stop them: the
 * browser starts them before any script of ours runs.
 *
 * ONLY when VITE_ICEFALL_OFFLINE=1. Unset, this plugin is never added and the
 * built HTML is byte-for-byte what it always was.
 */
function stripRemoteFonts(): Plugin {
  return {
    name: "icefall-offline-strip-remote-fonts",
    transformIndexHtml(html) {
      return html.replace(/[ \t]*<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\n?/g, "");
    },
  };
}

export default defineConfig(({ mode }) => {
  // `loadEnv` rather than `process.env` so the flag works however it is given —
  // `VITE_ICEFALL_OFFLINE=1 npm run dev` or a line in `.env.local`.
  const offline = loadEnv(mode, process.cwd(), "").VITE_ICEFALL_OFFLINE === "1";

  return {
    plugins: [react(), tailwindcss(), ...(offline ? [stripRemoteFonts()] : [])],
    /**
     * GATE THE DEFINITION, NOT THE RENDER — the lesson `src/lib/demoFlag.ts`
     * spells out, applied to the offline flag.
     *
     * Vite only substitutes `import.meta.env.VITE_X` for variables that EXIST.
     * With the flag unset it leaves the lookup to run at page load, so
     * `OFFLINE` is a runtime value, nothing folds to `false`, and Rollup keeps
     * `src/offline/` — putting every invented company, ticket and invoice into
     * `dist/assets` of an ordinary build, readable by anyone, exactly as
     * happened once already in `icefall-app`.
     *
     * Declaring it here gives the flag a literal value in every build, so an
     * ordinary build folds `OFFLINE` to `false` and drops the fixtures with it.
     * The value is identical either way: unset means not offline.
     */
    define: {
      "import.meta.env.VITE_ICEFALL_OFFLINE": JSON.stringify(offline ? "1" : ""),
    },
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    // 5197, not 5195: cadence-crm already holds 5195 under strictPort and one of
    // the two would simply refuse to start.
    server: { port: 5197, strictPort: true, host: true },
  };
});
