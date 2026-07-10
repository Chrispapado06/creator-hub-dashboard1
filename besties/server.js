/* Besties site + admin server — plain Node, no dependencies.
 *
 *   node server.js
 *
 * Env:
 *   PORT            port to listen on (default 4180)
 *   ADMIN_PASSWORD  password for /admin and the write APIs (default "besties123" — change it!)
 *   DATA_DIR        where the writable data (data.json + uploaded images) lives.
 *                   Point this at a persistent volume in production (e.g. Railway
 *                   mounts one at /data → set DATA_DIR=/data) so admin edits and
 *                   uploads survive restarts and redeploys. Defaults to the app
 *                   folder, which is correct for local development.
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : ROOT;
const DATA_FILE = path.join(DATA_DIR, "data.json");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const SEED_FILE = path.join(ROOT, "data.json"); // bundled default used to seed a fresh volume
const PORT = process.env.PORT || 4180;
const PASSWORD = process.env.ADMIN_PASSWORD || "besties123";

const MAX_JSON_BYTES = 2 * 1024 * 1024; // 2 MB for data.json saves
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB per uploaded image
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

const ANALYTICS_FILE = path.join(DATA_DIR, "analytics.json");
const TRACK_TYPES = new Set(["view", "click", "open"]); // open = conversion (outbound link opened)

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
};

function authorized(req) {
  const header = req.headers["authorization"] || "";
  const match = /^Bearer (.*)$/.exec(header);
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const wanted = Buffer.from(PASSWORD);
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req, res, limit, cb) {
  const chunks = [];
  let size = 0;
  let aborted = false;
  req.on("data", (chunk) => {
    if (aborted) return;
    size += chunk.length;
    if (size > limit) {
      aborted = true;
      sendJSON(res, 413, { error: "Body too large" });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    if (!aborted) cb(Buffer.concat(chunks));
  });
  req.on("error", () => {});
}

/* ------------ analytics store ------------
 * Aggregate counters kept in memory and flushed to analytics.json on the data
 * volume (debounced, plus on shutdown). Compact by design — we store running
 * totals, per-creator counts, and a per-day breakdown, not individual events.
 */

function emptyAnalytics() {
  return {
    totals: { view: 0, click: 0, open: 0 },
    byCreator: {}, // name -> { click, open }
    byDay: {}, // "YYYY-MM-DD" (UTC) -> { view, click, open }
    since: new Date().toISOString(),
  };
}

function loadAnalytics() {
  try {
    const a = JSON.parse(fs.readFileSync(ANALYTICS_FILE, "utf8"));
    a.totals = Object.assign({ view: 0, click: 0, open: 0 }, a.totals);
    a.byCreator = a.byCreator || {};
    a.byDay = a.byDay || {};
    a.since = a.since || new Date().toISOString();
    return a;
  } catch (e) {
    return emptyAnalytics();
  }
}

let analytics = loadAnalytics();
let analyticsDirty = false;
let flushTimer = null;

function flushAnalytics() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!analyticsDirty) return;
  analyticsDirty = false;
  try {
    const tmp = ANALYTICS_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(analytics));
    fs.renameSync(tmp, ANALYTICS_FILE);
  } catch (e) {
    console.error("Could not write analytics.json: " + e.message);
    analyticsDirty = true; // retry on next event/shutdown
  }
}

function scheduleFlush() {
  analyticsDirty = true;
  if (!flushTimer) flushTimer = setTimeout(flushAnalytics, 3000);
}

function recordEvent(type, creator) {
  if (!TRACK_TYPES.has(type)) return;
  const day = new Date().toISOString().slice(0, 10);
  analytics.totals[type] = (analytics.totals[type] || 0) + 1;
  if (!analytics.byDay[day]) analytics.byDay[day] = { view: 0, click: 0, open: 0 };
  analytics.byDay[day][type] = (analytics.byDay[day][type] || 0) + 1;
  if ((type === "click" || type === "open") && creator) {
    const name = String(creator).slice(0, 80);
    if (!analytics.byCreator[name]) analytics.byCreator[name] = { click: 0, open: 0 };
    analytics.byCreator[name][type] = (analytics.byCreator[name][type] || 0) + 1;
  }
  scheduleFlush();
}

// light in-memory per-IP rate limit so the public /api/track can't be trivially spammed
const rateMap = new Map();
const RATE_LIMIT = 120; // events per window per IP
const RATE_WINDOW_MS = 60 * 1000;

function clientIp(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.socket.remoteAddress || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  let rec = rateMap.get(ip);
  if (!rec || now - rec.start > RATE_WINDOW_MS) {
    rec = { start: now, count: 0 };
    rateMap.set(ip, rec);
  }
  rec.count++;
  if (rateMap.size > 5000) {
    for (const [k, v] of rateMap) if (now - v.start > RATE_WINDOW_MS) rateMap.delete(k);
  }
  return rec.count > RATE_LIMIT;
}

/* ------------ API handlers ------------ */

function handleVerify(req, res) {
  if (!authorized(req)) return sendJSON(res, 401, { error: "Wrong password" });
  sendJSON(res, 200, { ok: true });
}

function handleSave(req, res) {
  if (!authorized(req)) return sendJSON(res, 401, { error: "Wrong password" });
  readBody(req, res, MAX_JSON_BYTES, (buf) => {
    let data;
    try {
      data = JSON.parse(buf.toString("utf8"));
    } catch (e) {
      return sendJSON(res, 400, { error: "Invalid JSON" });
    }
    if (
      !data ||
      typeof data.SITE !== "object" ||
      data.SITE === null ||
      !Array.isArray(data.CREATORS)
    ) {
      return sendJSON(res, 400, { error: "Expected { SITE: {...}, CREATORS: [...] }" });
    }
    const tmp = DATA_FILE + ".tmp";
    try {
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) {
      return sendJSON(res, 500, { error: "Could not write data.json: " + e.message });
    }
    sendJSON(res, 200, { ok: true });
  });
}

// Public: record a { type, creator } event (or an array of them). Always 204.
function handleTrack(req, res) {
  const ip = clientIp(req);
  readBody(req, res, 8 * 1024, (buf) => {
    if (res.writableEnded) return; // readBody already responded (e.g. 413)
    if (!rateLimited(ip)) {
      try {
        const parsed = JSON.parse(buf.toString("utf8"));
        const events = Array.isArray(parsed) ? parsed.slice(0, 20) : [parsed];
        events.forEach((e) => {
          if (e && typeof e === "object") recordEvent(e.type, e.creator);
        });
      } catch (e) {
        /* ignore malformed beacons */
      }
    }
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
  });
}

// Auth: full analytics snapshot for the dashboard.
function handleStats(req, res) {
  if (!authorized(req)) return sendJSON(res, 401, { error: "Wrong password" });
  sendJSON(res, 200, analytics);
}

// Auth: wipe all analytics.
function handleStatsReset(req, res) {
  if (!authorized(req)) return sendJSON(res, 401, { error: "Wrong password" });
  analytics = emptyAnalytics();
  analyticsDirty = true;
  flushAnalytics();
  sendJSON(res, 200, { ok: true });
}

function handleUpload(req, res, query) {
  if (!authorized(req)) return sendJSON(res, 401, { error: "Wrong password" });
  const original = (query.get("name") || "image").toLowerCase();
  const ext = path.extname(original);
  if (!IMAGE_EXTS.has(ext)) {
    return sendJSON(res, 400, {
      error: "Unsupported file type. Use: " + Array.from(IMAGE_EXTS).join(", "),
    });
  }
  const base = path
    .basename(original, ext)
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
  const filename = Date.now() + "-" + base + ext;
  readBody(req, res, MAX_IMAGE_BYTES, (buf) => {
    if (buf.length === 0) return sendJSON(res, 400, { error: "Empty upload" });
    try {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
      fs.writeFileSync(path.join(IMAGES_DIR, filename), buf);
    } catch (e) {
      return sendJSON(res, 500, { error: "Could not save image: " + e.message });
    }
    sendJSON(res, 200, { ok: true, path: "images/" + filename });
  });
}

/* ------------ static files ------------ */

function serveStatic(req, res, urlPath) {
  if (urlPath === "/") urlPath = "/index.html";
  if (urlPath === "/admin") urlPath = "/admin.html";
  if (urlPath === "/analytics") urlPath = "/analytics.html";
  // never serve source or the raw analytics data over static
  if (urlPath === "/server.js" || urlPath === "/analytics.json") {
    res.writeHead(404);
    return res.end("not found");
  }
  // The writable data (creator list + uploaded images) is served from DATA_DIR,
  // which may be a persistent volume; everything else from the app folder.
  const base = urlPath === "/data.json" || urlPath.startsWith("/images/") ? DATA_DIR : ROOT;
  const file = path.join(base, path.normalize(urlPath));
  if (!file.startsWith(base)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404);
      return res.end("not found");
    }
    const ext = path.extname(file);
    const headers = { "Content-Type": TYPES[ext] || "application/octet-stream" };
    // always serve fresh content so admin edits show up immediately
    if (ext === ".json" || ext === ".html" || ext === ".js" || ext === ".css") {
      headers["Cache-Control"] = "no-store";
    }
    res.writeHead(200, headers);
    res.end(buf);
  });
}

/* ------------ startup: seed a fresh external volume ------------ */

if (DATA_DIR !== ROOT) {
  try {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE) && fs.existsSync(SEED_FILE)) {
      fs.copyFileSync(SEED_FILE, DATA_FILE);
      console.log("Seeded " + DATA_FILE + " from bundled default.");
    }
  } catch (e) {
    console.error("Could not initialize DATA_DIR (" + DATA_DIR + "): " + e.message);
  }
}

/* ------------ server ------------ */

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const p = url.pathname;

    if (req.method === "GET" && p === "/api/verify") return handleVerify(req, res);
    if (req.method === "POST" && p === "/api/save") return handleSave(req, res);
    if (req.method === "POST" && p === "/api/upload") return handleUpload(req, res, url.searchParams);
    if (req.method === "POST" && p === "/api/track") return handleTrack(req, res);
    if (req.method === "GET" && p === "/api/stats") return handleStats(req, res);
    if (req.method === "POST" && p === "/api/stats/reset") return handleStatsReset(req, res);
    if (p.startsWith("/api/")) return sendJSON(res, 404, { error: "Unknown API route" });

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      return res.end();
    }
    serveStatic(req, res, p);
  })
  .listen(PORT, () => {
    console.log("besties site on http://localhost:" + PORT);
    console.log("admin panel  on http://localhost:" + PORT + "/admin");
    console.log("data dir     " + DATA_DIR + (DATA_DIR === ROOT ? " (app folder)" : " (external volume)"));
    console.log("analytics    on http://localhost:" + PORT + "/analytics");
    if (!process.env.ADMIN_PASSWORD) {
      console.log('admin password: "besties123" (default — set ADMIN_PASSWORD env var to change)');
    }
  });

// flush pending analytics before the process exits (e.g. Railway redeploy)
["SIGTERM", "SIGINT"].forEach((sig) => {
  process.on(sig, () => {
    flushAnalytics();
    process.exit(0);
  });
});
