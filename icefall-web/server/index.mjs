/**
 * ICEFALL travel API — the real integration boundary.
 *
 * A tiny keys-server-side service that turns the app's demo flight/hotel search
 * into real bookable data via Duffel (flights) and LiteAPI (hotels). It exists
 * so that API KEYS NEVER TOUCH THE BROWSER: the frontend calls these endpoints,
 * this process holds the secrets and talks to the providers.
 *
 * ── HOW IT BEHAVES WITHOUT KEYS ─────────────────────────────────────────────
 * With no keys set, every provider reports `connected: false` from /api/health,
 * and the search endpoints return `{ connected: false }`. The frontend then uses
 * its own labelled demo data. So this is safe to run today: it is wired, honest
 * about being off, and flips to live the moment you add a key. Nothing here can
 * charge anyone — search only; booking/ticketing is a deliberate later step.
 *
 * Run:  node server/index.mjs   (Node 18+, for global fetch)
 * Keys: copy server/.env.example → server/.env and fill in.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { searchDuffelFlights } from "./duffel.mjs";
import { searchLiteApiStays } from "./liteapi.mjs";
import { handleWaitlist, waitlistConfigured } from "../api/_waitlist.mjs";

/* -- minimal .env loader (no dependency) ----------------------------------- */
function loadEnv() {
  try {
    const raw = readFileSync(new URL("./.env", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* no .env file — rely on the ambient environment */
  }
}
loadEnv();

/**
 * API_PORT before PORT, deliberately.
 *
 * `npm run dev:all` runs this process and Vite side by side, and whatever
 * launches the pair often exports PORT for the *web* server — which this one
 * would then take, leaving Vite unable to bind and the site down. API_PORT is
 * unambiguous; PORT stays supported for a plain `node server/index.mjs`.
 */
const PORT = Number(process.env.API_PORT || process.env.PORT) || 8788;
const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY || "";
const DUFFEL_VERSION = process.env.DUFFEL_VERSION || "v2";
const LITEAPI_KEY = process.env.LITEAPI_KEY || process.env.LITEAPI_SANDBOX_KEY || "";

const flightsLive = () => Boolean(DUFFEL_API_KEY);
const staysLive = () => Boolean(LITEAPI_KEY);

/**
 * Where waitlist signups land in development.
 *
 * Supabase if it is configured — the same store production uses, so the whole
 * path can be exercised for real before deploying. Otherwise a JSONL file next
 * to this server, which is gitignored and exists so the form is genuinely
 * end-to-end testable on a laptop with no cloud account. Vercel never takes
 * this branch: `WAITLIST_FILE` is set here and nowhere else, and its filesystem
 * is ephemeral anyway.
 */
const WAITLIST_FILE =
  process.env.WAITLIST_FILE || fileURLToPath(new URL("./.data/waitlist.jsonl", import.meta.url));
const waitlistEnv = { ...process.env, WAITLIST_FILE };

/* -- helpers --------------------------------------------------------------- */
function send(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) req.destroy(); // basic guard
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

/* -- routes ---------------------------------------------------------------- */
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") return send(res, 204, {});

  if (url.pathname === "/api/health") {
    return send(res, 200, {
      ok: true,
      flights: flightsLive() ? "live" : "not_connected",
      stays: staysLive() ? "live" : "not_connected",
      waitlist: waitlistConfigured(waitlistEnv) ? "live" : "not_connected",
      providers: { flights: "duffel", stays: "liteapi" },
    });
  }

  // The waitlist. Identical code to the Vercel function — see api/_waitlist.mjs.
  if (url.pathname === "/api/waitlist" && req.method === "POST") {
    const body = await readBody(req);
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "";
    const { status, body: payload } = await handleWaitlist(body, { env: waitlistEnv, ip });
    return send(res, status, payload);
  }

  if (url.pathname === "/api/flights/search" && req.method === "POST") {
    if (!flightsLive()) return send(res, 200, { connected: false, provider: "duffel" });
    const body = await readBody(req);
    if (!body?.origin?.code || !body?.destination?.code || !body?.outIso || !body?.backIso) {
      return send(res, 400, { connected: true, provider: "duffel", error: "origin, destination, outIso, backIso required", items: [] });
    }
    try {
      const items = await searchDuffelFlights({
        apiKey: DUFFEL_API_KEY,
        version: DUFFEL_VERSION,
        origin: body.origin,
        destination: body.destination,
        outIso: body.outIso,
        backIso: body.backIso,
        pax: body.pax || 1,
        cabin: body.cabin,
      });
      return send(res, 200, { connected: true, source: "duffel", items });
    } catch (err) {
      // Live but failed — report it, don't mask with fake fares.
      return send(res, 502, { connected: true, source: "duffel", items: [], error: String(err?.message || err) });
    }
  }

  if (url.pathname === "/api/stays/search" && req.method === "POST") {
    if (!staysLive()) return send(res, 200, { connected: false, provider: "liteapi" });
    const body = await readBody(req);
    if (!body?.checkinIso || !body?.checkoutIso) {
      return send(res, 400, { connected: true, provider: "liteapi", error: "checkinIso, checkoutIso required", items: [] });
    }
    try {
      const items = await searchLiteApiStays({
        apiKey: LITEAPI_KEY,
        objectiveId: body.objectiveId || "",
        cityName: body.cityName,
        country: body.country,
        lat: body.lat,
        lon: body.lon,
        checkinIso: body.checkinIso,
        checkoutIso: body.checkoutIso,
        adults: body.adults || 1,
      });
      return send(res, 200, { connected: true, source: "liteapi", items });
    } catch (err) {
      return send(res, 502, { connected: true, source: "liteapi", items: [], error: String(err?.message || err) });
    }
  }

  return send(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  const state = (on) => (on ? "LIVE" : "not connected");
  console.log(`ICEFALL travel API on http://localhost:${PORT}`);
  console.log(`  flights (Duffel):  ${state(flightsLive())}`);
  console.log(`  stays   (LiteAPI): ${state(staysLive())}`);
  console.log(
    `  waitlist:          ${process.env.SUPABASE_URL ? "LIVE (supabase)" : `dev file → ${WAITLIST_FILE}`}`,
  );
  if (!flightsLive() && !staysLive()) {
    console.log("  → no keys set; the app will use its labelled demo data. Add keys in server/.env to go live.");
  }
});
