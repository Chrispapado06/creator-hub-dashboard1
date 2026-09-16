// A plain static server for a built `dist`, with the SPA fallback the hosting
// rewrite gives the real deployment. No dependencies. Used by playwright.config.ts.
//
//   node e2e/serve.mjs <dist directory> <port>

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const [, , dirArg, portArg] = process.argv;
if (!dirArg || !portArg) {
  console.error("usage: node e2e/serve.mjs <dist directory> <port>");
  process.exit(2);
}
const root = resolve(dirArg);
if (!existsSync(join(root, "index.html"))) {
  console.error(`no index.html in ${root} — build a copy of the app first (never inside the repo while dev runs)`);
  process.exit(2);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".geojson": "application/geo+json",
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    // Unknown paths are app routes; asset-looking paths are genuinely missing.
    if (extname(path)) {
      res.writeHead(404).end();
      return;
    }
    file = join(root, "index.html");
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": file.endsWith("sw.js") || file.endsWith("index.html") ? "no-cache" : "public, max-age=3600",
  });
  createReadStream(file).pipe(res);
}).listen(Number(portArg), "127.0.0.1", () => {
  console.log(`serving ${root} on http://127.0.0.1:${portArg}`);
});
