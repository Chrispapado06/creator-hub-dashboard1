// ICEFALL ↔ Strava. One function, four routes, and the only place the client
// secret exists.
//
// ============================================================================
// WHY THIS IS SERVER CODE AT ALL
// ============================================================================
//
// ICEFALL is a static site — there is no `api/` directory and `vercel.json` is
// a SPA rewrite. Strava's token exchange and refresh both require the CLIENT
// SECRET, and a secret shipped in a browser bundle is a published secret:
// anyone could then impersonate this application to Strava for every athlete
// who has ever connected. So the exchange lives here, the secret lives in
// `supabase secrets`, and the tokens live in a table the browser cannot read
// (see migration 20260907140000).
//
// ============================================================================
// THE FOUR ROUTES, AND THE FLOW THROUGH THEM
// ============================================================================
//
//   POST /strava/begin      (authenticated)
//     Mints a single-use `state` bound to the caller and returns the Strava
//     consent URL. The app opens it.
//
//   GET  /strava/callback   (public — Strava's own redirect, carries no session)
//     Strava sends `code` + `state`. The state is consumed ONCE, the code is
//     PARKED under a one-time ticket, and the athlete is redirected back into
//     the app with that ticket. Nothing is exchanged or written here — see
//     `finalize` for why.
//
//   POST /strava/finalize   (authenticated)
//     The app, which has the session the callback lacked, presents the ticket.
//     The exchange and the write happen here, and ONLY when the ticket was
//     minted for the caller. This is what stops a consent URL minted by one
//     account from attaching a different person's Strava to it.
//
//   POST /strava/upload     (authenticated)
//     Takes one ICEFALL activity, refreshes the access token if it has expired,
//     builds a GPX from the recorded track and posts it to Strava's upload
//     endpoint.
//
//   POST /strava/disconnect (authenticated)
//     Deauthorises at Strava FIRST, then deletes the row.
//
// ============================================================================
// SECRETS
// ============================================================================
//
//   supabase secrets set STRAVA_CLIENT_ID=...
//   supabase secrets set STRAVA_CLIENT_SECRET=...
//   supabase secrets set STRAVA_REDIRECT_URI=https://<project>.functions.supabase.co/strava/callback
//   supabase secrets set ICEFALL_APP_ORIGIN=https://<your app>
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const STRAVA_AUTHORIZE = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN = "https://www.strava.com/oauth/token";
const STRAVA_DEAUTHORIZE = "https://www.strava.com/oauth/deauthorize";
const STRAVA_UPLOADS = "https://www.strava.com/api/v3/uploads";

/**
 * WHAT IS ASKED FOR, AND WHY EACH ONE.
 *
 *   activity:write  the whole point — post an activity to their profile.
 *   read            lets Strava name the athlete on the consent screen and
 *                   lets us store which account was connected, so somebody with
 *                   two Strava accounts can tell which one this is.
 *
 * NOTHING ELSE. `activity:read_all` would let ICEFALL read their private
 * activities and it has no reason to; asking for a scope you do not use is how
 * a consent screen teaches people not to read consent screens.
 */
const SCOPE = "activity:write,read";

/** The access token is refreshed this long before it actually expires. */
const REFRESH_MARGIN_SEC = 300;

/**
 * The only two places in the app a finished consent may land. Mirrors the CHECK
 * on `strava_oauth_states.return_to`; a third screen is added in both places or
 * neither.
 */
const RETURN_PATHS: ReadonlySet<string> = new Set(["/settings/connections", "/connect"]);

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret: ${name}`);
  return v;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors() },
  });
}

/**
 * The app is on a different origin from the function, so every authenticated
 * route needs CORS. The callback does not — it is a top-level redirect, not a
 * fetch.
 */
function cors(): Record<string, string> {
  return {
    "access-control-allow-origin": Deno.env.get("ICEFALL_APP_ORIGIN") ?? "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, GET, OPTIONS",
  };
}

/** Service-role client. Bypasses RLS, which is how it reaches the token table. */
function admin(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

/**
 * Who is calling?
 *
 * The caller's own JWT is verified by asking Supabase who it belongs to, rather
 * than by decoding it here. Decoding without verifying is how a function ends up
 * trusting a token somebody wrote themselves.
 */
async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data, error } = await admin().auth.getUser(auth.slice(7));
  if (error || !data.user) return null;
  return data.user.id;
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                      */
/* -------------------------------------------------------------------------- */

interface Connection {
  user_id: string;
  athlete_id: number | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
}

/**
 * A usable access token, refreshing first if it is about to expire.
 *
 * REFRESHED WITH A MARGIN, not at the moment of expiry: a token with four
 * seconds left will be expired by the time the upload reaches Strava, and the
 * failure looks like a permissions problem rather than a clock one.
 *
 * The new refresh token REPLACES the old one — Strava rotates them, and storing
 * the response's `refresh_token` is what stops the connection dying silently the
 * next time it is needed.
 */
async function usableToken(db: SupabaseClient, conn: Connection): Promise<string> {
  const expiresInSec = (Date.parse(conn.expires_at) - Date.now()) / 1000;
  if (expiresInSec > REFRESH_MARGIN_SEC) return conn.access_token;

  const res = await fetch(STRAVA_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env("STRAVA_CLIENT_ID"),
      client_secret: env("STRAVA_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });

  if (!res.ok) {
    /*
     * A refusal here is usually the athlete having revoked ICEFALL from their
     * Strava settings. The row is deleted rather than kept: a stored token that
     * can never work again is not a connection, and leaving it would show
     * "Connected" on a screen for an account that has disconnected.
     */
    if (res.status === 400 || res.status === 401) {
      await db.from("strava_connections").delete().eq("user_id", conn.user_id);
      throw new HttpError(409, "strava_revoked");
    }
    throw new HttpError(502, "strava_refresh_failed");
  }

  const t = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  await db
    .from("strava_connections")
    .update({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(t.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", conn.user_id);

  return t.access_token;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* GPX                                                                         */
/* -------------------------------------------------------------------------- */

interface Point {
  t: number;
  lat: number;
  lon: number;
  altitude: number | null;
}

/**
 * The recorded track as GPX.
 *
 * WHY A FILE UPLOAD RATHER THAN `POST /activities`. Strava's manual-activity
 * endpoint takes a name, a duration and a distance — it draws no map, because
 * there is no route in it. ICEFALL records the actual track, and throwing it
 * away on the way to Strava would send a worse version of something the athlete
 * already has.
 *
 * EVERY VALUE HERE IS RECORDED, NONE IS INTERPOLATED. A point with no altitude
 * gets no `<ele>` rather than a guessed one — an invented elevation becomes an
 * invented climb on somebody's Strava profile, which is the one place it would
 * be read as a claim about them.
 */
function toGpx(name: string, points: Point[]): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const seg = points
    .map((p) => {
      const ele = p.altitude === null ? "" : `<ele>${p.altitude.toFixed(1)}</ele>`;
      return `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${ele}<time>${new Date(
        p.t,
      ).toISOString()}</time></trkpt>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ICEFALL" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${esc(name)}</name><trkseg>${seg}</trkseg></trk>
</gpx>`;
}

/**
 * ICEFALL's activity types to Strava's.
 *
 * Strava's vocabulary is smaller than ours, so several of ours collapse into
 * one of theirs. Where there is no honest equivalent the answer is `Workout` —
 * Strava's own catch-all — rather than the nearest-sounding sport: filing a
 * scramble as a "Rock Climb" would put it in the athlete's climbing totals,
 * which is a claim about what they did rather than a formatting choice.
 */
const SPORT: Record<string, string> = {
  "outdoor-run": "Run",
  "trail-run": "TrailRun",
  "treadmill-run": "VirtualRun",
  "track-run": "Run",
  hiking: "Hike",
  "fast-hiking": "Hike",
  trekking: "Hike",
  backpacking: "Hike",
  "road-cycling": "Ride",
  "mountain-biking": "MountainBikeRide",
  "gravel-cycling": "GravelRide",
  "indoor-cycling": "VirtualRide",
  mountaineering: "Hike",
  "alpine-climbing": "RockClimbing",
  scrambling: "Hike",
  "ski-mountaineering": "BackcountrySki",
  "rock-climbing": "RockClimbing",
  "indoor-climbing": "RockClimbing",
  bouldering: "RockClimbing",
  skiing: "AlpineSki",
  "ski-touring": "BackcountrySki",
  snowboarding: "Snowboard",
  snowshoeing: "Snowshoe",
  kayaking: "Kayaking",
  paddleboarding: "StandUpPaddling",
  swimming: "Swim",
  other: "Workout",
};

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

async function begin(req: Request): Promise<Response> {
  const uid = await callerId(req);
  if (!uid) return json({ error: "unauthenticated" }, 401);

  const db = admin();
  await db.rpc("strava_sweep_states");

  /*
   * WHERE TO SEND THEM BACK TO. Two screens begin this flow — settings, and the
   * last page of sign-up — and each wants the athlete returned to itself. The
   * value is a PATH chosen from this allowlist and nothing else: a caller-
   * supplied URL at the end of an OAuth flow is an open redirect, and the
   * database CHECK on the column is the second fence behind this one.
   */
  const body = (await req.json().catch(() => ({}))) as { returnTo?: string };
  const returnTo = RETURN_PATHS.has(body.returnTo ?? "") ? body.returnTo! : "/settings/connections";

  const state = crypto.randomUUID();
  const { error } = await db
    .from("strava_oauth_states")
    .insert({ state, user_id: uid, return_to: returnTo });
  if (error) return json({ error: "state_failed" }, 500);

  const url = new URL(STRAVA_AUTHORIZE);
  url.searchParams.set("client_id", env("STRAVA_CLIENT_ID"));
  url.searchParams.set("redirect_uri", env("STRAVA_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  /*
   * `force` rather than `auto`: with `auto`, an athlete who declined a scope
   * the first time is never shown the screen again, so "Connect" would appear
   * to do nothing forever. `force` always shows it, which is also the only way
   * to grant a permission that was previously refused.
   */
  url.searchParams.set("approval_prompt", "force");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);

  return json({ url: url.toString() });
}

async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const appOrigin = env("ICEFALL_APP_ORIGIN");
  /* Until a state row has been read, the only honest destination is the
     settings screen — a failure before that point has no bound return path. */
  let returnTo = "/settings/connections";
  const back = (status: string, extra: Record<string, string> = {}) => {
    const dest = new URL(`${appOrigin}${returnTo}`);
    dest.searchParams.set("strava", status);
    for (const [k, v] of Object.entries(extra)) dest.searchParams.set(k, v);
    return Response.redirect(dest.toString(), 302);
  };

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  /* Strava sends `error=access_denied` when somebody presses Cancel. That is a
     decision, not a fault, and it is reported as its own outcome — but it is
     reported to the RIGHT screen, which means the state row is read first. */
  const declined = url.searchParams.get("error") !== null;

  /* No `state` at all: nothing is bound and nothing can be burned. */
  if (!state) return back(declined ? "declined" : "failed");

  const db = admin();

  /* SINGLE USE, WHATEVER THE OUTCOME: the row is deleted as it is read, so a
     replayed callback cannot be honoured twice. `.select()` on the delete is
     what makes the read and the consume one atomic step. Done before any
     branch, so a Cancel on the sign-up page returns to the sign-up page. */
  const { data: rows } = await db
    .from("strava_oauth_states")
    .delete()
    .eq("state", state)
    .select("user_id, created_at, return_to");
  const bound = rows?.[0];
  if (!bound) return back(declined ? "declined" : "expired");
  /* Re-checked against the allowlist even though the CHECK constraint already
     guarantees it: a redirect target is the one value worth two fences. */
  if (RETURN_PATHS.has(String(bound.return_to))) returnTo = String(bound.return_to);

  /* Only a request that matched a real state row earns database housekeeping.
     Sweeping on every unauthenticated hit would let anybody make Postgres do
     work by guessing URLs at a public endpoint. */
  await db.rpc("strava_sweep_states");

  if (declined) return back("declined");
  if (!code) return back("failed");
  if (Date.now() - Date.parse(bound.created_at as string) > 10 * 60_000) return back("expired");

  /*
   * PARK THE CODE. DO NOT EXCHANGE IT HERE.
   *
   * This request carries no ICEFALL session. `state` proves which account
   * STARTED the flow, not who is holding the browser now — and those can be
   * different people: an attacker begins a flow on their own account and hands
   * the consent URL to a victim. If the exchange happened here, the victim's
   * Strava would be written against the attacker's user id. So the code waits
   * under a ticket, and `finalize` — called by the app WITH a session — finishes
   * only when the session and the ticket agree.
   */
  const ticket = crypto.randomUUID();
  const { error } = await db.from("strava_pending_links").insert({
    ticket,
    user_id: bound.user_id,
    code,
    /* Strava reports the granted scope on the redirect, not in the token body
       — the athlete may have unticked one. Carried through for `finalize`. */
    granted_scope: url.searchParams.get("scope") ?? "",
  });
  if (error) return back("failed");

  return back("pending", { ticket });
}

async function finalize(req: Request): Promise<Response> {
  const uid = await callerId(req);
  if (!uid) return json({ error: "unauthenticated" }, 401);

  const body = (await req.json().catch(() => ({}))) as { ticket?: string };
  const ticket = String(body.ticket ?? "");
  if (!ticket) return json({ error: "no_ticket" }, 400);

  const db = admin();

  /* Burned as it is read, BEFORE the ownership check: a ticket presented by
     the wrong session is destroyed, not left for its rightful owner to use
     later — which in the attack above would be the attacker. A ticket that is
     never presented at all (the browser that received it had no session) is
     not burned here; it lives until the ten-minute sweep, unreachable to
     anyone who does not hold the UUID. */
  const { data: rows } = await db
    .from("strava_pending_links")
    .delete()
    .eq("ticket", ticket)
    .select("user_id, code, granted_scope, created_at");
  const pending = rows?.[0];
  if (!pending) return json({ error: "ticket_invalid" }, 409);
  if (pending.user_id !== uid) return json({ error: "ticket_not_yours" }, 403);
  if (Date.now() - Date.parse(pending.created_at as string) > 10 * 60_000) {
    return json({ error: "ticket_expired" }, 409);
  }

  const res = await fetch(STRAVA_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env("STRAVA_CLIENT_ID"),
      client_secret: env("STRAVA_CLIENT_SECRET"),
      code: pending.code,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return json({ error: "exchange_failed" }, 502);

  const t = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    scope?: string;
    athlete?: { id: number; username?: string };
  };

  const scope = String(pending.granted_scope || t.scope || "");
  /* NULL when Strava did not identify the athlete — never a placeholder id. */
  const athleteId = typeof t.athlete?.id === "number" ? t.athlete.id : null;
  const athleteUsername = t.athlete?.username ?? null;

  const { error } = await db.from("strava_connections").upsert(
    {
      user_id: uid,
      athlete_id: athleteId,
      athlete_username: athleteUsername,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(t.expires_at * 1000).toISOString(),
      scope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    /*
     * THE GRANT ALREADY EXISTS AT STRAVA. The exchange succeeded a moment ago,
     * so ICEFALL is now listed under the athlete's "My Apps" holding a token
     * that no row records and nothing could ever revoke from here. Hand it
     * back before reporting the failure — best effort, and the app is told
     * whether it worked so the sentence it shows is true either way.
     */
    let revoked = false;
    try {
      const r = await fetch(STRAVA_DEAUTHORIZE, {
        method: "POST",
        headers: { authorization: `Bearer ${t.access_token}` },
      });
      revoked = r.ok;
    } catch {
      revoked = false;
    }
    return json({ error: "store_failed", revokedAtStrava: revoked }, 500);
  }

  /* Connected, but possibly without the permission that makes it useful. The
     app reads THIS — a measured answer — not the query string it arrived on. */
  return json({
    connected: true,
    scope,
    canUpload: scope.includes("activity:write"),
    athleteId,
    athleteUsername,
  });
}

async function upload(req: Request): Promise<Response> {
  const uid = await callerId(req);
  if (!uid) return json({ error: "unauthenticated" }, 401);

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    activityTypeId?: string;
    points?: Point[];
  };

  const points = (body.points ?? []).filter(
    (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.t),
  );
  /*
   * NO TRACK, NO UPLOAD. Strava would accept a manual activity with a duration
   * and a distance and no route — but those numbers came from the track, so an
   * activity with no track has nothing measured behind them either. Refusing is
   * the honest answer and the app says so.
   */
  if (points.length < 2) return json({ error: "no_track" }, 400);

  const db = admin();
  const { data: conn } = await db
    .from("strava_connections")
    .select("user_id, athlete_id, access_token, refresh_token, expires_at, scope")
    .eq("user_id", uid)
    .maybeSingle();
  if (!conn) return json({ error: "not_connected" }, 409);
  if (!(conn as Connection).scope.includes("activity:write")) {
    return json({ error: "missing_scope" }, 403);
  }

  let token: string;
  try {
    token = await usableToken(db, conn as Connection);
  } catch (e) {
    const err = e as HttpError;
    return json({ error: err.message }, err.status ?? 502);
  }

  const name = body.name?.trim() || "ICEFALL activity";
  const gpx = toGpx(name, points);

  const form = new FormData();
  form.append("file", new Blob([gpx], { type: "application/gpx+xml" }), "icefall.gpx");
  form.append("data_type", "gpx");
  form.append("name", name);
  if (body.description) form.append("description", body.description);
  const sport = SPORT[body.activityTypeId ?? "other"] ?? "Workout";
  form.append("sport_type", sport);

  const res = await fetch(STRAVA_UPLOADS, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const out = (await res.json().catch(() => ({}))) as { id?: number; error?: string };

  if (!res.ok) return json({ error: "upload_rejected", detail: out.error ?? null }, 502);

  /*
   * STRAVA'S UPLOAD IS ASYNCHRONOUS. A 201 means "queued", not "on your
   * profile" — Strava still has to process the file and can reject it minutes
   * later as a duplicate. The app is told the id and the truth about what that
   * means; claiming success here would be claiming an outcome nobody has.
   */
  return json({ queued: true, uploadId: out.id ?? null });
}

async function disconnect(req: Request): Promise<Response> {
  const uid = await callerId(req);
  if (!uid) return json({ error: "unauthenticated" }, 401);

  const db = admin();
  const { data: conn } = await db
    .from("strava_connections")
    .select("user_id, athlete_id, access_token, refresh_token, expires_at, scope")
    .eq("user_id", uid)
    .maybeSingle();

  if (conn) {
    /* Deauthorise at Strava FIRST. Deleting our row first would leave a live
       token on their side that nothing can ever revoke. A failure here is not
       fatal — the row is still removed, because a token we can no longer use is
       worse kept than dropped — but it is reported. */
    let revoked = false;
    try {
      const token = await usableToken(db, conn as Connection);
      const res = await fetch(STRAVA_DEAUTHORIZE, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      revoked = res.ok;
    } catch {
      revoked = false;
    }
    await db.from("strava_connections").delete().eq("user_id", uid);
    return json({ disconnected: true, revokedAtStrava: revoked });
  }

  return json({ disconnected: true, revokedAtStrava: false });
}

/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

  const path = new URL(req.url).pathname.replace(/^\/strava\/?/, "");
  try {
    if (req.method === "POST" && path === "begin") return await begin(req);
    if (req.method === "GET" && path === "callback") return await callback(req);
    if (req.method === "POST" && path === "finalize") return await finalize(req);
    if (req.method === "POST" && path === "upload") return await upload(req);
    if (req.method === "POST" && path === "disconnect") return await disconnect(req);
    return json({ error: "not_found" }, 404);
  } catch (e) {
    /* Never echo the exception: a misconfigured secret would otherwise be
       reported to the caller by name. */
    console.error("strava function error", e);
    return json({ error: "server_error" }, 500);
  }
});
