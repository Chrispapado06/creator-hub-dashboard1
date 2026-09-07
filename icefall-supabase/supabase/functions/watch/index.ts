// ICEFALL ↔ watch accounts (COROS, Polar, Suunto, Garmin). One function,
// four vendors, dispatched through one adapter interface.
//
// ============================================================================
// WHY THIS IS SERVER CODE AT ALL
// ============================================================================
//
// Same fact as strava/index.ts: ICEFALL is a static site. Every one of these
// vendors' token exchanges requires a client secret (COROS is the one
// exception — a public client, "none" auth) and none of them can be handed
// to a browser bundle. So the exchange lives here, the secrets live in
// `supabase secrets`, and the tokens live in a table the browser cannot read
// (see migration 20260907160000).
//
// ============================================================================
// THE ROUTES, AND THE FLOW THROUGH THEM
// ============================================================================
//
//   GET  /watch/providers                 (public) — what's connectable, per vendor.
//
//   POST /watch/<provider>/begin          (authenticated)
//     Mints a single-use `state` (and a PKCE verifier/challenge — minted for
//     every provider uniformly; ignored by the two vendors that don't use
//     PKCE) bound to the caller, and returns the vendor's consent URL.
//
//   GET  /watch/<provider>/callback       (public — the vendor's own redirect)
//     The vendor sends `code` + `state`. State is consumed ONCE, the code is
//     PARKED under a one-time ticket, and the athlete is redirected back into
//     the app with that ticket. Nothing is exchanged here — see `finalize`.
//
//   POST /watch/<provider>/finalize       (authenticated)
//     The app presents the ticket. Exchange and write happen here, and only
//     when the ticket was minted for the caller.
//
//   POST /watch/<provider>/activities     (authenticated)
//     Pulls a window of activities, capped per-vendor, refreshing the token
//     first if needed.
//
//   POST /watch/<provider>/disconnect     (authenticated)
//     Revokes at the vendor FIRST, then deletes the row.
//
//   POST /watch/<provider>/webhook        NOT BUILT. No route exists for it —
//     it lands in the same change that lands a vendor approval, never before.
//
// ============================================================================
// SECRETS
// ============================================================================
//
//   supabase secrets set COROS_CLIENT_ID_EU=...
//   supabase secrets set COROS_CLIENT_ID_US=...
//   supabase secrets set POLAR_CLIENT_ID=...
//   supabase secrets set POLAR_CLIENT_SECRET=...
//   supabase secrets set SUUNTO_CLIENT_ID=...
//   supabase secrets set SUUNTO_CLIENT_SECRET=...
//   supabase secrets set SUUNTO_SUBSCRIPTION_KEY=...
//   supabase secrets set WATCH_REDIRECT_BASE=https://<project>.functions.supabase.co/watch
//
// ICEFALL_APP_ORIGIN, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY already
// exist (set for the strava function). Redirect URI registered with each
// vendor: `${WATCH_REDIRECT_BASE}/<provider>/callback`.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { WATCH_PROVIDERS, type WatchAvailability, type WatchProvider } from "./types.ts";
import { ADAPTERS, HttpError, type TokenSet, type WatchAdapter } from "./registry.ts";

/** The access token is refreshed this long before it actually expires. */
const REFRESH_MARGIN_SEC = 300;

/**
 * The only two places in the app a finished consent may land. Mirrors the
 * CHECK on `watch_oauth_states.return_to`.
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
 * route needs CORS. The callback does not — it is a top-level redirect, not
 * a fetch.
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
 * The caller's own JWT is verified by asking Supabase who it belongs to,
 * rather than by decoding it here. Decoding without verifying is how a
 * function ends up trusting a token somebody wrote themselves.
 */
async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data, error } = await admin().auth.getUser(auth.slice(7));
  if (error || !data.user) return null;
  return data.user.id;
}

/* -------------------------------------------------------------------------- */
/* PKCE                                                                        */
/* -------------------------------------------------------------------------- */

/** 43-128 chars from A-Za-z0-9-._~, per RFC 7636. Minted for every provider
 *  uniformly — the two vendors with no PKCE simply never read it back. */
function randomCodeVerifier(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function s256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                      */
/* -------------------------------------------------------------------------- */

interface WatchConnectionRow {
  user_id: string;
  provider: WatchProvider;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  scope: string;
  api_base: string;
  region: string | null;
}

/**
 * A usable access token, refreshing first if it is about to expire.
 *
 * Generalised from strava/index.ts:147-204: refreshed WITH A MARGIN, not at
 * the moment of expiry — a token with four seconds left will be expired by
 * the time the request reaches the vendor. The ROTATED REFRESH TOKEN IS
 * PERSISTED EVERY TIME: all four vendors rotate it, and skipping this is how
 * a connection dies silently the next time it is needed.
 *
 * A connection with no refresh token that has expired cannot be renewed —
 * Polar v3 never issues one, so this is a real path, not a theoretical one —
 * and is treated exactly like a vendor-side revoke: the row is deleted and
 * `vendor_revoked` is thrown.
 */
async function usableToken(
  db: SupabaseClient,
  conn: WatchConnectionRow,
  adapter: WatchAdapter,
): Promise<string> {
  const expiresInSec = (Date.parse(conn.expires_at) - Date.now()) / 1000;
  if (expiresInSec > REFRESH_MARGIN_SEC) return conn.access_token;

  const forget = () =>
    db.from("watch_connections").delete().eq("user_id", conn.user_id).eq("provider", conn.provider);

  if (!conn.refresh_token) {
    await forget();
    throw new HttpError(409, "vendor_revoked");
  }

  let token: TokenSet;
  try {
    token = await adapter.refresh({ refreshToken: conn.refresh_token, region: conn.region });
  } catch (e) {
    /*
     * A refusal here is usually the athlete having revoked ICEFALL from
     * their watch service's own settings. The row is deleted rather than
     * kept: a stored token that can never work again is not a connection.
     */
    const status = e instanceof HttpError ? e.status : 0;
    if (status === 400 || status === 401) {
      await forget();
      throw new HttpError(409, "vendor_revoked");
    }
    throw new HttpError(502, "vendor_unreachable");
  }

  await db
    .from("watch_connections")
    .update({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      expires_at: token.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", conn.user_id)
    .eq("provider", conn.provider);

  return token.accessToken;
}

function availabilityFor(adapter: WatchAdapter): WatchAvailability {
  if (adapter.gate === "not-built") return "not-built";
  if (adapter.requiredSecrets.every((s) => !!Deno.env.get(s))) return "ready";
  if (adapter.gate === "vendor-approval-required") return "vendor-approval-required";
  return "needs-registration";
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

function providers(): Response {
  const out = {} as Record<WatchProvider, WatchAvailability>;
  for (const p of WATCH_PROVIDERS) out[p] = availabilityFor(ADAPTERS[p]);
  return json({ providers: out });
}

async function begin(req: Request, provider: WatchProvider): Promise<Response> {
  const uid = await callerId(req);
  if (!uid) return json({ error: "unauthenticated" }, 401);

  const adapter = ADAPTERS[provider];
  const db = admin();
  await db.rpc("watch_sweep_states");

  const body = (await req.json().catch(() => ({}))) as { returnTo?: string; region?: string };
  const returnTo = RETURN_PATHS.has(body.returnTo ?? "") ? body.returnTo! : "/settings/connections";

  /* `region` is accepted for COROS only; any other provider with a region
     is a 400 — and COROS without one is too, since the issuer cannot be
     chosen without it. */
  let region: string | null = null;
  if (adapter.regional) {
    /* Positive narrowing on purpose — negating a literal against a plain
       `string | undefined` does not narrow away from it in TypeScript, so
       matching the literals directly is what lets `region = body.region`
       below type-check. */
    if (body.region === "eu" || body.region === "us") {
      region = body.region;
    } else {
      return json({ error: "bad_region" }, 400);
    }
  } else if (body.region !== undefined) {
    return json({ error: "bad_region" }, 400);
  }

  const availability = availabilityFor(adapter);
  if (availability !== "ready") return json({ error: "not_available", availability }, 409);

  const state = crypto.randomUUID();
  const codeVerifier = randomCodeVerifier();
  const codeChallenge = await s256Challenge(codeVerifier);
  const redirectUri = `${env("WATCH_REDIRECT_BASE")}/${provider}/callback`;

  const { error } = await db.from("watch_oauth_states").insert({
    state,
    user_id: uid,
    provider,
    return_to: returnTo,
    code_verifier: codeVerifier,
    region,
  });
  if (error) return json({ error: "state_failed" }, 500);

  const url = adapter.authorizeUrl({ state, codeChallenge, redirectUri, region });
  return json({ url });
}

async function callback(req: Request, provider: WatchProvider): Promise<Response> {
  const url = new URL(req.url);
  const appOrigin = env("ICEFALL_APP_ORIGIN");
  /* Until a state row has been read, the only honest destination is the
     settings screen — a failure before that point has no bound return path. */
  let returnTo = "/settings/connections";
  const back = (status: string, extra: Record<string, string> = {}) => {
    const dest = new URL(`${appOrigin}${returnTo}`);
    /* The param prefix is `watch`, not `strava`, so both flows can land on
       the same screen without fighting over the same query key. */
    dest.searchParams.set("watch", status);
    dest.searchParams.set("provider", provider);
    for (const [k, v] of Object.entries(extra)) dest.searchParams.set(k, v);
    return Response.redirect(dest.toString(), 302);
  };

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const declined = url.searchParams.get("error") !== null;

  if (!state) return back(declined ? "declined" : "failed");

  const db = admin();

  /* SINGLE USE, WHATEVER THE OUTCOME: the row is deleted as it is read, so a
     replayed callback cannot be honoured twice. `.select()` on the delete is
     what makes the read and the consume one atomic step. */
  const { data: rows } = await db
    .from("watch_oauth_states")
    .delete()
    .eq("state", state)
    .select("user_id, provider, created_at, return_to, code_verifier, region");
  const bound = rows?.[0];
  if (!bound) return back(declined ? "declined" : "expired");
  if (RETURN_PATHS.has(String(bound.return_to))) returnTo = String(bound.return_to);

  /* Only a request that matched a real state row earns database housekeeping. */
  await db.rpc("watch_sweep_states");

  if (declined) return back("declined");
  if (!code) return back("failed");
  if (Date.now() - Date.parse(bound.created_at as string) > 10 * 60_000) return back("expired");

  /*
   * PARK THE CODE. DO NOT EXCHANGE IT HERE — same reasoning as
   * 20260907140000_strava_connection.sql:122-139. `code_verifier` and
   * `region` are COPIED from the state row onto the pending row NOW,
   * because the state row is about to be gone and the verifier is needed at
   * token-exchange time inside `finalize`.
   */
  const ticket = crypto.randomUUID();
  const { error } = await db.from("watch_pending_links").insert({
    ticket,
    user_id: bound.user_id,
    provider: bound.provider,
    code,
    code_verifier: bound.code_verifier,
    region: bound.region,
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

  /* Burned as it is read, BEFORE the ownership check — see the ticket-pattern
     argument at strava/index.ts:423-439 and migration:122-139, unchanged. */
  const { data: rows } = await db
    .from("watch_pending_links")
    .delete()
    .eq("ticket", ticket)
    .select("user_id, provider, code, code_verifier, region, granted_scope, created_at");
  const pending = rows?.[0];
  if (!pending) return json({ error: "ticket_invalid" }, 409);
  if (pending.user_id !== uid) return json({ error: "ticket_not_yours" }, 403);
  if (Date.now() - Date.parse(pending.created_at as string) > 10 * 60_000) {
    return json({ error: "ticket_expired" }, 409);
  }

  /* The provider in the URL path is ignored for lookup — it's here only so
     the route reads correctly in logs. The pending row carries the truth. */
  const provider = pending.provider as WatchProvider;
  const adapter = ADAPTERS[provider];
  const redirectUri = `${env("WATCH_REDIRECT_BASE")}/${provider}/callback`;

  let token: TokenSet;
  try {
    token = await adapter.exchange({
      code: String(pending.code),
      codeVerifier: String(pending.code_verifier ?? ""),
      redirectUri,
      region: (pending.region as string | null) ?? null,
    });
  } catch {
    return json({ error: "exchange_failed" }, 502);
  }

  let providerUserId = token.providerUserId;
  let accountLabel = token.accountLabel;
  let scope = String(pending.granted_scope || token.scope || "");

  /* Fill whatever the token response did not carry — best effort. A failure
     here does not fail the connection: partial identity beats none. */
  if (providerUserId === null || accountLabel === null) {
    try {
      const id = await adapter.identify({ accessToken: token.accessToken, apiBase: token.apiBase });
      providerUserId = providerUserId ?? id.providerUserId;
      accountLabel = accountLabel ?? id.accountLabel;
      if (!scope && id.scope) scope = id.scope;
    } catch {
      // best effort only
    }
  }

  const { error } = await db.from("watch_connections").upsert(
    {
      user_id: uid,
      provider,
      provider_user_id: providerUserId,
      account_label: accountLabel,
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      expires_at: token.expiresAt,
      scope,
      api_base: token.apiBase,
      region: pending.region ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );

  if (error) {
    /*
     * THE GRANT ALREADY EXISTS AT THE VENDOR. The exchange succeeded a
     * moment ago; hand it back before reporting the failure — best effort,
     * and the app is told whether it worked so the sentence it shows is
     * true either way.
     */
    let revoked = false;
    try {
      revoked = await adapter.revoke({ accessToken: token.accessToken, apiBase: token.apiBase });
    } catch {
      revoked = false;
    }
    return json({ error: "store_failed", revokedAtVendor: revoked }, 500);
  }

  return json({
    connected: true,
    provider,
    accountLabel,
    providerUserId,
    scope,
    canImport: adapter.canImport(scope),
  });
}

async function activities(req: Request, provider: WatchProvider): Promise<Response> {
  const uid = await callerId(req);
  if (!uid) return json({ error: "unauthenticated" }, 401);

  const adapter = ADAPTERS[provider];
  const db = admin();
  const { data: conn } = await db
    .from("watch_connections")
    .select("user_id, provider, access_token, refresh_token, expires_at, scope, api_base, region")
    .eq("user_id", uid)
    .eq("provider", provider)
    .maybeSingle();
  if (!conn) return json({ error: "not_connected" }, 409);

  const body = (await req.json().catch(() => ({}))) as { sinceIso?: string; untilIso?: string };
  /* Never invent a window: if untilIso is absent it is now(). */
  const until = body.untilIso ? new Date(body.untilIso) : new Date();
  /* Server-side window cap, per vendor, enforced HERE and not trusted from
     the body. */
  const capMs = adapter.maxWindowDays * 24 * 60 * 60 * 1000;
  const earliestAllowed = until.getTime() - capMs;
  const requestedSinceMs = body.sinceIso ? Date.parse(body.sinceIso) : earliestAllowed;
  const since = new Date(Math.max(requestedSinceMs, earliestAllowed));

  let accessToken: string;
  try {
    accessToken = await usableToken(db, conn as WatchConnectionRow, adapter);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: "vendor_unreachable" }, 502);
  }

  try {
    const list = await adapter.listActivities({
      accessToken,
      apiBase: (conn as WatchConnectionRow).api_base,
      sinceIso: since.toISOString(),
      untilIso: until.toISOString(),
    });
    /* `through` is the end of the window ACTUALLY covered — what the client
       stores as its cursor. */
    return json({
      activities: list,
      through: until.toISOString(),
      windowDays: adapter.maxWindowDays,
    });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: "vendor_unreachable" }, 502);
  }
}

async function disconnect(req: Request, provider: WatchProvider): Promise<Response> {
  const uid = await callerId(req);
  if (!uid) return json({ error: "unauthenticated" }, 401);

  const adapter = ADAPTERS[provider];
  const db = admin();
  const { data: conn } = await db
    .from("watch_connections")
    .select("user_id, provider, access_token, refresh_token, expires_at, scope, api_base, region")
    .eq("user_id", uid)
    .eq("provider", provider)
    .maybeSingle();

  if (conn) {
    /* Revoke at the vendor FIRST. Deleting our row first would leave a live
       token on their side nothing could ever revoke again. A failure here is
       not fatal — the row is still removed — but it is reported, never
       assumed. */
    let revoked = false;
    try {
      const accessToken = await usableToken(db, conn as WatchConnectionRow, adapter);
      revoked = await adapter.revoke({
        accessToken,
        apiBase: (conn as WatchConnectionRow).api_base,
      });
    } catch {
      revoked = false;
    }
    await db.from("watch_connections").delete().eq("user_id", uid).eq("provider", provider);
    return json({ disconnected: true, revokedAtVendor: revoked });
  }

  return json({ disconnected: true, revokedAtVendor: false });
}

/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

  const path = new URL(req.url).pathname.replace(/^\/watch\/?/, "");

  try {
    if (req.method === "GET" && path === "providers") return providers();

    const [providerRaw, action] = path.split("/");
    const isProvider = (WATCH_PROVIDERS as readonly string[]).includes(providerRaw);

    if (!isProvider) return json({ error: "unknown_provider" }, 400);
    const provider = providerRaw as WatchProvider;

    if (req.method === "POST" && action === "begin") return await begin(req, provider);
    if (req.method === "GET" && action === "callback") return await callback(req, provider);
    if (req.method === "POST" && action === "finalize") return await finalize(req);
    if (req.method === "POST" && action === "activities") return await activities(req, provider);
    if (req.method === "POST" && action === "disconnect") return await disconnect(req, provider);
    /* /watch/<provider>/webhook is deliberately unhandled — falls through to
       404, exactly as an unbuilt route should. */
    return json({ error: "not_found" }, 404);
  } catch (e) {
    /* Never echo the exception: a misconfigured secret would otherwise be
       reported to the caller by name. */
    console.error("watch function error", e);
    return json({ error: "server_error" }, 500);
  }
});
