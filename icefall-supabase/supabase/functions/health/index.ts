// ICEFALL ↔ health accounts (Polar, WHOOP, Withings, Oura). One function,
// four vendors, dispatched through one adapter interface.
//
// ════════════════════════════════════════════════════════════════════════════
// WHY THIS IS SERVER CODE AT ALL — the sentence to re-read before editing
// ════════════════════════════════════════════════════════════════════════════
//
// ICEFALL's app is a Vite bundle. ANY VARIABLE PREFIXED `VITE_` IS COMPILED
// INTO THE PUBLIC BUNDLE AND SERVED TO EVERY VISITOR. The Oura work said it
// first and said it best (`icefall-app/README.md`): "If a
// `VITE_OURA_CLIENT_SECRET` ever appears, it has already leaked."
//
// So every client secret, every token exchange, every refresh, and Withings'
// HMAC signing live HERE, in `supabase secrets`, and every athlete's tokens
// live in a table the browser has no grant to read. If you find yourself
// wanting a secret in `icefall-app/src/health/`, the design has gone wrong,
// not the configuration.
//
// ════════════════════════════════════════════════════════════════════════════
// THE ROUTES
// ════════════════════════════════════════════════════════════════════════════
//
//   GET  /health/providers                  (public)
//     What is connectable, per vendor, with the reason when it is not.
//
//   POST /health/<provider>/begin           (authenticated)
//     Checks the Article 9 consent FIRST, mints a single-use `state` (+ a PKCE
//     verifier, minted uniformly and ignored by the vendors that do not use
//     it), and returns the vendor's consent URL.
//
//   GET  /health/<provider>/callback        (public — the vendor's redirect)
//     Consumes the state ONCE, PARKS the code under a one-time ticket, and
//     redirects into the app. Nothing is exchanged here — the callback carries
//     no ICEFALL session, so a code exchanged here could not be bound to the
//     person it belongs to.
//
//   POST /health/<provider>/finalize        (authenticated)
//     The app presents the ticket. Exchange, seal, write — only when the
//     ticket was minted for the caller.
//
//   POST /health/<provider>/disconnect      (authenticated)
//     Revokes at the vendor first where the vendor allows it, then DELETES the
//     row. Polar's agreement requires that delete by name.
//
//   POST /health/withings/webhook           (public — Withings' own call)
//   HEAD /health/withings/webhook           (public — Withings' reachability probe)
//     The only door Withings data comes through. There is no polling anywhere
//     in this function; see `withings.ts`.
//
// ════════════════════════════════════════════════════════════════════════════
// SECRETS — none of these exist yet; Charlie registers each app and sets them
// ════════════════════════════════════════════════════════════════════════════
//
//   supabase secrets set HEALTH_TOKEN_KEY=...        # 32 random bytes, base64
//   supabase secrets set POLAR_CLIENT_ID=...
//   supabase secrets set POLAR_CLIENT_SECRET=...
//   supabase secrets set WHOOP_CLIENT_ID=...
//   supabase secrets set WHOOP_CLIENT_SECRET=...
//   supabase secrets set WITHINGS_CLIENT_ID=...
//   supabase secrets set WITHINGS_CLIENT_SECRET=...
//   supabase secrets set HEALTH_REDIRECT_BASE=https://<project>.functions.supabase.co/health
//
// ICEFALL_APP_ORIGIN, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY already exist
// (set for the strava and watch functions). The redirect URI registered with
// each vendor is `${HEALTH_REDIRECT_BASE}/<provider>/callback`; Withings' own
// notification URL is `${HEALTH_REDIRECT_BASE}/withings/webhook`.
//
// WITH NO SECRETS SET, EVERY VENDOR REPORTS `needs-credentials` AND THE SCREEN
// SAYS SO. Nothing here fakes a connection, and no route half-works.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  HEALTH_PROVIDERS,
  type HealthAvailability,
  type HealthProvider,
} from "./types.ts";
import { ADAPTERS, HttpError, type TokenSet, type HealthAdapter } from "./registry.ts";
import { hasTokenKey, openNullable, openToken, sealNullable, sealToken } from "./crypto.ts";

/** The access token is refreshed this long before it actually expires. */
const REFRESH_MARGIN_SEC = 300;

/** Mirrors the CHECK on `health_oauth_states.return_to`. */
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

/** Verified by asking Supabase who the token belongs to, never by decoding it
 *  here — decoding without verifying is how a function trusts a token somebody
 *  wrote themselves. */
async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data, error } = await admin().auth.getUser(auth.slice(7));
  if (error || !data.user) return null;
  return data.user.id;
}

/* -------------------------------------------------------------------------- */
/* PKCE — minted uniformly, read by whoever uses it                            */
/* -------------------------------------------------------------------------- */

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
/* Availability                                                                */
/* -------------------------------------------------------------------------- */

/**
 * THE GATE IS CHECKED BEFORE THE SECRETS, and the order is the whole point.
 *
 * A vendor on a legal hold reports `legal-hold` even with a complete set of
 * credentials sitting in the environment. Registering the app is not what is
 * missing, and an availability that flipped to `ready` the moment somebody
 * pasted a client id would be exactly the accident the hold exists to prevent.
 *
 * HEALTH_TOKEN_KEY is required for EVERY vendor, not just WHOOP. A connection
 * that cannot be stored encrypted must not be stored, so with no key nothing
 * is `ready` and no connect button is drawn anywhere.
 */
function availabilityFor(adapter: HealthAdapter): HealthAvailability {
  if (adapter.gate === "legal-hold") return "legal-hold";
  if (!hasTokenKey()) return "needs-credentials";
  if (!adapter.requiredSecrets.every((s) => !!Deno.env.get(s))) return "needs-credentials";
  if (!Deno.env.get("HEALTH_REDIRECT_BASE")) return "needs-credentials";
  return "ready";
}

function providers(): Response {
  const out: Record<
    string,
    { availability: HealthAvailability; gateReason: string; scopes: string[] }
  > = {};
  for (const p of HEALTH_PROVIDERS) {
    const a = ADAPTERS[p];
    out[p] = {
      availability: availabilityFor(a),
      /* The server's own sentence, passed through the client unaltered so
         there is exactly one copy of the reason. Empty when there is no gate —
         never a cheerful placeholder. */
      gateReason: a.gateReason,
      scopes: [...a.scopes],
    };
  }
  return json({ providers: out });
}

/* -------------------------------------------------------------------------- */
/* Consent — the gate before the gate                                          */
/* -------------------------------------------------------------------------- */

/**
 * Heart rate, HRV, sleep and blood oxygen are Article 9 special category data.
 * The lawful basis ICEFALL uses is explicit consent, recorded separately from
 * signing up and separately from the marketing tick — `health_consent_events`,
 * purpose `health-metrics`, migration 20260903060000.
 *
 * CHECKED BEFORE THE AUTHORIZE URL IS ISSUED, not after the callback. Checking
 * afterwards means checking after the tokens exist and the first fetch is
 * already possible. `handleOuraConnect` in `icefall-web/api/_oura.mjs` does
 * exactly this and this is the same gate, in the same order, for the other
 * three.
 *
 * `never-asked` and `declined` are NOT collapsed: the first is a screen nobody
 * has been shown, the second is a person who said no.
 */
async function consentGranted(
  db: SupabaseClient,
  uid: string,
): Promise<{ granted: boolean; reason: "granted" | "never-asked" | "declined" | "withdrawn" | "unreachable" }> {
  const { data, error } = await db.rpc("health_consent_state", { p_user: uid });
  if (error) return { granted: false, reason: "unreachable" };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.decision) return { granted: false, reason: "never-asked" };
  if (row.decision === "granted") return { granted: true, reason: "granted" };
  if (row.decision === "withdrawn") return { granted: false, reason: "withdrawn" };
  return { granted: false, reason: "declined" };
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                      */
/* -------------------------------------------------------------------------- */

interface HealthConnectionRow {
  user_id: string;
  provider: HealthProvider;
  provider_user_id: string | null;
  /** CIPHERTEXT. See crypto.ts — the database never holds a readable token. */
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  scope: string;
  api_base: string;
}

/**
 * A usable access token, refreshing first if it is about to expire.
 *
 * Same shape as `watch/index.ts`'s: refreshed WITH A MARGIN, because a token
 * with four seconds left will be expired by the time the request reaches the
 * vendor; and THE ROTATED REFRESH TOKEN IS PERSISTED EVERY TIME, because all
 * four of these vendors rotate it and skipping the write is how a connection
 * dies silently the next time it is needed.
 *
 * The one thing added here is the seal/open pair around every read and write.
 */
async function usableToken(
  db: SupabaseClient,
  conn: HealthConnectionRow,
  adapter: HealthAdapter,
): Promise<string> {
  const forget = () =>
    db
      .from("health_connections")
      .delete()
      .eq("user_id", conn.user_id)
      .eq("provider", conn.provider);

  let access: string;
  let refresh: string | null;
  try {
    access = await openToken(conn.access_token);
    refresh = await openNullable(conn.refresh_token);
  } catch {
    /* The key is gone, wrong, or the row was tampered with. NOT treated as a
       vendor revoke: deleting somebody's connection because our own key is
       misconfigured would destroy a working grant to hide an operator error.
       The connection is left alone and the caller is told we cannot use it. */
    throw new HttpError(503, "token_unreadable");
  }

  const expiresInSec = (Date.parse(conn.expires_at) - Date.now()) / 1000;
  if (expiresInSec > REFRESH_MARGIN_SEC) return access;

  if (!refresh) {
    await forget();
    throw new HttpError(409, "vendor_revoked");
  }

  let token: TokenSet;
  try {
    token = await adapter.refresh({ refreshToken: refresh });
  } catch (e) {
    /* A refusal here is usually the athlete having revoked ICEFALL in the
       vendor's own settings. A stored token that can never work again is not
       a connection, so the row goes. */
    const status = e instanceof HttpError ? e.status : 0;
    if (status === 400 || status === 401) {
      await forget();
      throw new HttpError(409, "vendor_revoked");
    }
    throw new HttpError(502, "vendor_unreachable");
  }

  await db
    .from("health_connections")
    .update({
      access_token: await sealToken(token.accessToken),
      refresh_token: await sealNullable(token.refreshToken),
      expires_at: token.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", conn.user_id)
    .eq("provider", conn.provider);

  return token.accessToken;
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

async function begin(req: Request, provider: HealthProvider): Promise<Response> {
  const uid = await callerId(req);
  if (!uid) return json({ error: "unauthenticated" }, 401);

  const adapter = ADAPTERS[provider];
  const availability = availabilityFor(adapter);
  if (availability !== "ready") {
    return json({ error: "not_available", availability, gateReason: adapter.gateReason }, 409);
  }

  const db = admin();
  await db.rpc("health_sweep_states");

  const consent = await consentGranted(db, uid);
  if (!consent.granted) return json({ error: "consent_required", consent: consent.reason }, 403);

  const body = (await req.json().catch(() => ({}))) as { returnTo?: string };
  const returnTo = RETURN_PATHS.has(body.returnTo ?? "") ? body.returnTo! : "/settings/connections";

  const state = crypto.randomUUID();
  const codeVerifier = randomCodeVerifier();
  const codeChallenge = await s256Challenge(codeVerifier);
  const redirectUri = `${env("HEALTH_REDIRECT_BASE")}/${provider}/callback`;

  const { error } = await db.from("health_oauth_states").insert({
    state,
    user_id: uid,
    provider,
    return_to: returnTo,
    code_verifier: codeVerifier,
  });
  if (error) return json({ error: "state_failed" }, 500);

  return json({ url: adapter.authorizeUrl({ state, codeChallenge, redirectUri }) });
}

async function callback(req: Request, provider: HealthProvider): Promise<Response> {
  const url = new URL(req.url);
  const appOrigin = env("ICEFALL_APP_ORIGIN");
  let returnTo = "/settings/connections";
  const back = (status: string, extra: Record<string, string> = {}) => {
    const dest = new URL(`${appOrigin}${returnTo}`);
    /* The param prefix is `health`, distinct from `strava` and `watch`, so all
       three flows can land on the same screen without fighting over a key. */
    dest.searchParams.set("health", status);
    dest.searchParams.set("provider", provider);
    for (const [k, v] of Object.entries(extra)) dest.searchParams.set(k, v);
    return Response.redirect(dest.toString(), 302);
  };

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const declined = url.searchParams.get("error") !== null;

  if (!state) return back(declined ? "declined" : "failed");

  const db = admin();

  /* SINGLE USE, WHATEVER THE OUTCOME: read and consume in one atomic step, so
     a replayed callback cannot be honoured twice. */
  const { data: rows } = await db
    .from("health_oauth_states")
    .delete()
    .eq("state", state)
    .select("user_id, provider, created_at, return_to, code_verifier");
  const bound = rows?.[0];
  if (!bound) return back(declined ? "declined" : "expired");
  if (RETURN_PATHS.has(String(bound.return_to))) returnTo = String(bound.return_to);

  await db.rpc("health_sweep_states");

  if (declined) return back("declined");
  if (!code) return back("failed");
  if (Date.now() - Date.parse(bound.created_at as string) > 10 * 60_000) return back("expired");

  /* PARK THE CODE. DO NOT EXCHANGE IT HERE — this request carries no ICEFALL
     session, so a token exchanged now could not be bound to the person it
     belongs to. The verifier is copied across because the state row is about
     to be gone and `finalize` needs it. */
  const ticket = crypto.randomUUID();
  const { error } = await db.from("health_pending_links").insert({
    ticket,
    user_id: bound.user_id,
    provider: bound.provider,
    code,
    code_verifier: bound.code_verifier,
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

  /* Burned as it is read, BEFORE the ownership check — a ticket presented by
     the wrong account is spent, not retried. */
  const { data: rows } = await db
    .from("health_pending_links")
    .delete()
    .eq("ticket", ticket)
    .select("user_id, provider, code, code_verifier, granted_scope, created_at");
  const pending = rows?.[0];
  if (!pending) return json({ error: "ticket_invalid" }, 409);
  if (pending.user_id !== uid) return json({ error: "ticket_not_yours" }, 403);
  if (Date.now() - Date.parse(pending.created_at as string) > 10 * 60_000) {
    return json({ error: "ticket_expired" }, 409);
  }

  const provider = pending.provider as HealthProvider;
  const adapter = ADAPTERS[provider];

  /* RE-CHECKED HERE, not only at `begin`. A hold could have been lifted, a
     consent could have been withdrawn, or a secret removed, in the minute the
     person spent on the vendor's page. */
  if (availabilityFor(adapter) !== "ready") {
    return json({ error: "not_available", gateReason: adapter.gateReason }, 409);
  }
  const consent = await consentGranted(db, uid);
  if (!consent.granted) return json({ error: "consent_required", consent: consent.reason }, 403);

  const redirectUri = `${env("HEALTH_REDIRECT_BASE")}/${provider}/callback`;

  let token: TokenSet;
  try {
    token = await adapter.exchange({
      code: String(pending.code),
      codeVerifier: String(pending.code_verifier ?? ""),
      redirectUri,
    });
  } catch {
    return json({ error: "exchange_failed" }, 502);
  }

  let providerUserId = token.providerUserId;
  let accountLabel = token.accountLabel;
  const scope = String(pending.granted_scope || token.scope || "");

  if (providerUserId === null || accountLabel === null) {
    try {
      const id = await adapter.identify({ accessToken: token.accessToken, apiBase: token.apiBase });
      providerUserId = providerUserId ?? id.providerUserId;
      accountLabel = accountLabel ?? id.accountLabel;
    } catch {
      // Best effort. A connection with an unnamed account still works, and the
      // card says the vendor did not say rather than inventing a label.
    }
  }

  /* SEALED BEFORE THE WRITE. There is no branch that reaches the insert with a
     readable token — see crypto.ts for the WHOOP term this discharges. */
  let sealedAccess: string;
  let sealedRefresh: string | null;
  try {
    sealedAccess = await sealToken(token.accessToken);
    sealedRefresh = await sealNullable(token.refreshToken);
  } catch {
    /* The grant exists at the vendor and we cannot store it safely. Hand it
       back rather than keeping an unencrypted copy or a dangling grant. */
    let revoked = false;
    try {
      revoked = await adapter.revoke({
        accessToken: token.accessToken,
        apiBase: token.apiBase,
        providerUserId,
      });
    } catch {
      revoked = false;
    }
    return json({ error: "encryption_unavailable", revokedAtVendor: revoked }, 503);
  }

  const { error } = await db.from("health_connections").upsert(
    {
      user_id: uid,
      provider,
      provider_user_id: providerUserId,
      account_label: accountLabel,
      access_token: sealedAccess,
      refresh_token: sealedRefresh,
      expires_at: token.expiresAt,
      scope,
      api_base: token.apiBase,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );

  if (error) {
    let revoked = false;
    try {
      revoked = await adapter.revoke({
        accessToken: token.accessToken,
        apiBase: token.apiBase,
        providerUserId,
      });
    } catch {
      revoked = false;
    }
    return json({ error: "store_failed", revokedAtVendor: revoked }, 500);
  }

  /*
   * WITHINGS' SUBSCRIPTIONS ARE PART OF CONNECTING, NOT AN EXTRA.
   *
   * Its terms forbid polling, so a Withings connection with no webhook
   * subscription would be a connection that can never deliver anything. The
   * outcome is reported to the app so the card can say which categories are
   * live rather than implying all of them are.
   */
  let deliveryDetail: string | null = null;
  let deliveryOk = true;
  if (adapter.afterConnect) {
    try {
      const r = await adapter.afterConnect({
        accessToken: token.accessToken,
        apiBase: token.apiBase,
        providerUserId,
        callbackUrl: `${env("HEALTH_REDIRECT_BASE")}/${provider}/webhook`,
      });
      deliveryOk = r.ok;
      deliveryDetail = r.ok ? null : r.detail;
    } catch {
      deliveryOk = false;
      deliveryDetail = "all categories";
    }
  }

  return json({
    connected: true,
    provider,
    accountLabel,
    providerUserId,
    scope,
    deliveryOk,
    deliveryDetail,
  });
}

async function disconnect(req: Request, provider: HealthProvider): Promise<Response> {
  const uid = await callerId(req);
  if (!uid) return json({ error: "unauthenticated" }, 401);

  const adapter = ADAPTERS[provider];
  const db = admin();
  const { data: conn } = await db
    .from("health_connections")
    .select(
      "user_id, provider, provider_user_id, access_token, refresh_token, expires_at, scope, api_base",
    )
    .eq("user_id", uid)
    .eq("provider", provider)
    .maybeSingle();

  if (!conn) return json({ disconnected: true, revokedAtVendor: false });

  const row = conn as HealthConnectionRow;

  /* Revoke at the vendor FIRST where the vendor allows it. Deleting our row
     first would leave a live grant on somebody's health data that nothing
     could ever revoke again. A failure is reported, never assumed. */
  let revoked = false;
  try {
    const accessToken = await usableToken(db, row, adapter);
    revoked = await adapter.revoke({
      accessToken,
      apiBase: row.api_base,
      providerUserId: row.provider_user_id,
    });
  } catch {
    revoked = false;
  }

  /*
   * ═══════════════════════════════════════════════════════════════════════
   * POLAR: "must delete the token when a user disconnects"
   * ═══════════════════════════════════════════════════════════════════════
   *
   * This delete is where that obligation is discharged — it is a DELETE, not
   * a flag, not a soft delete, not a "disconnected_at" column that leaves the
   * ciphertext in the row. Polar names it explicitly and the other three are
   * given the same treatment because ICEFALL's own rule already asks for it:
   * a disconnect that only hides a row is a disconnect that lied.
   *
   * Any stored MEASUREMENTS go the same way through
   * `health_record_consent`'s withdrawal path (migration 20260903060000) —
   * this function owns the credential, that one owns the readings.
   */
  await db.from("health_connections").delete().eq("user_id", uid).eq("provider", provider);
  /* Anything Withings had already delivered but ICEFALL had not read is
     removed with the connection: an unprocessed notice about a person who has
     disconnected is data with no permission behind it.

     Keyed on the ICEFALL user, not on the vendor id. A row with no
     provider_user_id would otherwise be un-deletable, and matching an empty
     string would match nothing while looking like it had worked. */
  await db.from("health_webhook_events").delete().eq("provider", provider).eq("user_id", uid);

  return json({ disconnected: true, revokedAtVendor: revoked });
}

/* -------------------------------------------------------------------------- */
/* Withings' webhook — the only door its data comes through                    */
/* -------------------------------------------------------------------------- */

/**
 * Withings POSTs a form body saying WHICH account and WHAT CHANGED — never the
 * measurement itself. It expects a prompt 200; a callback that errors or hangs
 * is retried and then the subscription is dropped, which would silently end
 * the connection.
 *
 * WHAT THIS ROUTE DOES NOT DO, AND MUST BE SAID PLAINLY: it does not fetch the
 * measurement. The reading side is not built — no Withings measurement is
 * stored, normalised or displayed anywhere in ICEFALL today, and the
 * connections screen says exactly that rather than implying numbers will
 * appear. The notice is recorded so that when the reader is built it has a
 * queue to work from, and so an operator can see whether Withings is actually
 * calling. `processed_at` stays null until something processes it.
 */
async function withingsWebhook(req: Request): Promise<Response> {
  /* The reachability probe Withings makes before accepting a subscription. */
  if (req.method === "HEAD") return new Response(null, { status: 200 });

  const form = await req.formData().catch(() => null);
  const userid = String(form?.get("userid") ?? "").trim();
  const appli = String(form?.get("appli") ?? "").trim();
  if (!userid || !appli) return json({ ok: true }, 200);

  const db = admin();

  /*
   * MATCHED TO A CONNECTION BEFORE IT IS STORED.
   *
   * This endpoint is public — it has to be, Withings calls it — so anybody can
   * post to it. A notice about a `userid` ICEFALL has never connected is
   * discarded rather than recorded, so the table cannot be filled by a
   * stranger. It still answers 200: telling an unauthenticated caller whether
   * a given Withings id is a member here is an answer it has not earned.
   */
  const { data: conn } = await db
    .from("health_connections")
    .select("user_id")
    .eq("provider", "withings")
    .eq("provider_user_id", userid)
    .maybeSingle();
  if (!conn) return json({ ok: true }, 200);

  await db.from("health_webhook_events").insert({
    provider: "withings",
    provider_user_id: userid,
    user_id: conn.user_id,
    kind: appli,
    /* Withings' own window for what changed. Kept verbatim, as strings —
       ICEFALL does not know its timezone assumptions and will not guess. */
    window_start: String(form?.get("startdate") ?? ""),
    window_end: String(form?.get("enddate") ?? ""),
  });

  return json({ ok: true }, 200);
}

/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });

  const path = new URL(req.url).pathname.replace(/^\/health\/?/, "");

  try {
    if (req.method === "GET" && path === "providers") return providers();

    const [providerRaw, action] = path.split("/");
    if (!(HEALTH_PROVIDERS as readonly string[]).includes(providerRaw)) {
      return json({ error: "unknown_provider" }, 400);
    }
    const provider = providerRaw as HealthProvider;

    if (req.method === "POST" && action === "begin") return await begin(req, provider);
    if (req.method === "GET" && action === "callback") return await callback(req, provider);
    if (req.method === "POST" && action === "finalize") return await finalize(req);
    if (req.method === "POST" && action === "disconnect") return await disconnect(req, provider);
    /* Withings only. The other three have no webhook route because none is
       built for them — an unbuilt route 404s rather than accepting a post it
       would do nothing with. */
    if (provider === "withings" && action === "webhook" && (req.method === "POST" || req.method === "HEAD")) {
      return await withingsWebhook(req);
    }
    return json({ error: "not_found" }, 404);
  } catch (e) {
    /* Never echo the exception: a misconfigured secret would otherwise be
       reported to the caller by name. */
    console.error("health function error", e);
    return json({ error: "server_error" }, 500);
  }
});
