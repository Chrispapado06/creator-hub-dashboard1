/**
 * Oura Ring — the whole behaviour, transport-agnostic.
 *
 * Same shape as `_waitlist.mjs`, `_support.mjs` and `_enquiry.mjs`, and for the
 * same stated reason: there are two transports and they must not drift.
 *
 *   api/oura/*.js        Vercel serverless functions — production
 *   server/index.mjs     the local node API server   — `npm run dev:all`
 *
 * Both do nothing but hand the request here and forward `{status, body}` back,
 * so a bug found against ngrok in development is the bug that was in production.
 * That matters more here than it did for the waitlist: a webhook signature
 * check that is right in one transport and wrong in the other is an open door
 * that only opens in the place nobody is watching.
 *
 * ── WHY THIS LIVES IN icefall-web AND NOT IN THE PHONE APP ──────────────────
 *
 * `icefall-app` is a pure Vite SPA on its way to being wrapped by Capacitor. A
 * Capacitor app has no public web origin — it runs from `capacitor://`. Oura
 * needs two stable, public, exact-match HTTPS URLs forever: the OAuth
 * `redirect_uri` and the webhook callback. Neither can point at a native bundle.
 *
 * And constraint one has no other answer. The client secret is used three times
 * — the token exchange, every refresh, and the webhook HMAC — and all three
 * happen in this process. A `VITE_` variable is compiled into the bundle and
 * readable by anyone who opens the app; there is no version of this that runs
 * in the browser.
 *
 * ── WHAT REACHES A SCREEN TODAY ─────────────────────────────────────────────
 *
 * Nothing. Every place in `icefall-app` that would show HRV, sleep or resting
 * heart rate hardcodes its own absence — `SensorGap`, `unavailable("not-
 * connected")`, `restingHeartRateBpm: undefined` — rather than reading a
 * variable. None of them is edited by this work. The list is in the handover
 * note; until those files change, this integration fills a database and not a
 * tile, and saying otherwise would be a comment claiming a guarantee the code
 * does not keep.
 */

import { rateLimited } from "./_ratelimit.mjs";
import {
  authorizeUrl,
  exchangeCode,
  ouraCollection,
  ouraConfig,
  ouraConfigured,
  ouraGet,
  refreshTokens,
  safeEqual,
  signState,
  verifyState,
  verifyWebhookSignature,
} from "./_oura-client.mjs";
import {
  claimRefresh,
  connectionForOuraUser,
  connectionForUser,
  consentGranted,
  deleteEverything,
  markConnectionState,
  openToken,
  pruneExpired,
  recordWebhookEvent,
  saveNewConnection,
  serviceRpc,
  storeConfig,
  storeWritable,
  storeRotatedTokens,
  upsertDay,
  userFromBearer,
  userRpc,
} from "./_oura-store.mjs";
import {
  BACKFILL_ORDER,
  COLLECTIONS,
  COLLECTION_FIELDS,
  WEBHOOK_TO_COLLECTION,
} from "./_oura-normalise.mjs";

/** Days of history fetched when somebody first connects. */
const DEFAULT_BACKFILL_DAYS = 30;
const MAX_BACKFILL_DAYS = 365;

/**
 * How old the newest reading may be before a screen is told there is no recent
 * data.
 *
 * Two days rather than one, because Oura's sleep and readiness only reach their
 * cloud when the person opens the Oura app, so a night can legitimately arrive
 * a day late. Beyond that the honest answer is that we do not know how they
 * slept — not the reading from before last night wearing today's label.
 */
const DEFAULT_FRESHNESS_DAYS = 2;

const nowIso = () => new Date().toISOString();
const isoDay = (d) => d.toISOString().slice(0, 10);

function readConfigured(env) {
  return Boolean(storeConfig(env));
}

/** Everything the write side needs, or the honest reason it is not there. */
export function ouraReady(env = {}) {
  if (!ouraConfigured(env)) return { ready: false, reason: "oura_not_configured" };
  if (!readConfigured(env)) return { ready: false, reason: "supabase_not_configured" };
  if (!storeWritable(env)) return { ready: false, reason: "server_credentials_missing" };
  if (!env.OURA_STATE_SECRET || env.OURA_STATE_SECRET.length < 32) {
    return { ready: false, reason: "state_secret_missing" };
  }
  return { ready: true, reason: "" };
}

const notConfigured = (reason) => ({
  status: 503,
  body: {
    ok: false,
    code: "not_configured",
    reason,
    error: "The Oura connection isn't set up on this deployment yet.",
  },
});

/* -- the return-URL allowlist ---------------------------------------------- */

/**
 * Where the browser is sent after the callback.
 *
 * AN ALLOWLIST, NOT A PARAMETER. A `redirect_uri`-shaped value that a caller
 * can choose is an open redirect, and this one sits at the end of an OAuth
 * flow, which is precisely where one is worth the most. The client may name a
 * destination; it may only name one that is already in OURA_APP_RETURN_URLS.
 *
 * This is also the seam the native app will need. A Capacitor build has no web
 * origin, so its entry here is a universal link or a custom scheme that the
 * shell intercepts. That decision is not made in this file — but the allowlist
 * is where it lands, and nothing else has to change to accommodate it.
 */
function returnUrls(env) {
  return String(env.OURA_APP_RETURN_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function allowedReturn(candidate, env) {
  const list = returnUrls(env);
  if (!list.length) return "";
  if (!candidate) return list[0];
  return list.includes(candidate) ? candidate : "";
}

function withParams(url, params) {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    return url;
  }
}

/* -- 1. the authorize redirect --------------------------------------------- */

/**
 * POST /api/oura/connect — hand back the URL to send the person to.
 *
 * It returns the URL rather than redirecting because the caller is the app,
 * which has to open it in a system browser or an in-app auth session; a 302 to
 * a fetch() is not a place a person can type their Oura password.
 *
 * @param {object} body   { returnTo? }
 * @param {object} ctx    { env, ip, bearer }
 */
export async function handleOuraConnect(body, { env = {}, ip = "", bearer = "" } = {}) {
  const ready = ouraReady(env);
  if (!ready.ready) return notConfigured(ready.reason);

  if (rateLimited("oura-connect", ip, { windowMs: 60_000, max: 10 })) {
    return { status: 429, body: { ok: false, error: "Too many attempts. Try again in a minute." } };
  }

  const user = await userFromBearer(bearer, env);
  if (!user) return { status: 401, body: { ok: false, code: "not_signed_in", error: "Sign in first." } };

  /*
    CONSENT IS CHECKED HERE, BEFORE THE REDIRECT.

    Heart rate, sleep and respiratory rate are special category data under
    Article 9. That needs its own explicit permission — not the marketing tick
    on the waitlist form, and not signing up for an account. Checking it after
    the callback would mean checking it after the tokens exist and the first
    fetch is already possible.

    `never-asked` and `declined` are different answers and are kept different:
    the first is a screen that has not been shown, the second is a person who
    said no. Collapsing them would let the app re-ask somebody who refused.
  */
  const consent = await consentGranted(user.id, env);
  if (!consent.granted) {
    return {
      status: 403,
      body: {
        ok: false,
        code: "consent_required",
        reason: consent.reason,
        error:
          consent.reason === "store-unreachable"
            ? "We couldn't check your health-data permission just now. Please try again."
            : "Connecting a ring needs your separate permission to store health measurements.",
      },
    };
  }

  const returnTo = allowedReturn(String(body?.returnTo || "").trim(), env);
  if (!returnTo) {
    return notConfigured("return_url_not_allowlisted");
  }

  const state = signState({ userId: user.id, returnKey: returnTo }, env);
  if (!state) return notConfigured("state_secret_missing");

  const cfg = ouraConfig(env);
  return {
    status: 200,
    body: { ok: true, url: authorizeUrl({ state }, cfg), scopes: cfg.scopes },
  };
}

/* -- 2. the callback ------------------------------------------------------- */

/**
 * GET /api/oura/callback — the only place an authorization code is exchanged.
 *
 * SERVER SIDE, ALWAYS. The code arrives here, is swapped for tokens using the
 * client secret held by this process, and the browser is sent onward with
 * nothing in the URL but a word saying whether it worked. No token, no Oura
 * user id and no health value is ever put in a query string.
 *
 * @returns {{status, headers?, body}} — a 302 when there is a safe place to
 * send the browser, and a plain body when there is not.
 */
export async function handleOuraCallback(query = {}, { env = {}, ip = "" } = {}) {
  const ready = ouraReady(env);
  if (!ready.ready) return notConfigured(ready.reason);

  if (rateLimited("oura-callback", ip, { windowMs: 60_000, max: 20 })) {
    return { status: 429, body: { ok: false, error: "Too many attempts. Try again in a minute." } };
  }

  const state = verifyState(String(query.state || ""), env);

  /*
    A bad state is refused with a page, not a redirect. The destination lives
    INSIDE the signed state, so a state we cannot verify is a state whose
    return URL we also cannot trust — bouncing the browser to a value taken
    from an unverified parameter is the open redirect the allowlist exists to
    prevent.
  */
  if (!state) {
    return {
      status: 400,
      body: {
        ok: false,
        code: "bad_state",
        error: "That link has expired or was not issued by ICEFALL. Start again from the app.",
      },
    };
  }

  const back = allowedReturn(state.returnKey, env);
  const fail = (reason) =>
    back
      ? { status: 302, headers: { Location: withParams(back, { oura: "error", reason }) }, body: { ok: false, reason } }
      : { status: 400, body: { ok: false, code: reason, error: "Connecting your ring did not complete." } };

  // Oura's own refusal, passed through rather than reworded. `access_denied`
  // means the person pressed Cancel, which is not an error to apologise for.
  if (query.error) return fail(String(query.error).slice(0, 60));

  const code = String(query.code || "");
  if (!code) return fail("no_code");

  // Consent is re-read here. The authorize URL is valid for ten minutes and a
  // person can withdraw inside that window; a grant that started before the
  // withdrawal is still a grant that must not complete after it.
  const consent = await consentGranted(state.userId, env);
  if (!consent.granted) return fail("consent_" + consent.reason.replace(/-/g, "_"));

  const cfg = ouraConfig(env);
  let tokens;
  try {
    tokens = await exchangeCode(code, cfg);
  } catch (e) {
    console.error("[oura] code exchange failed:", e?.message || e);
    return fail("exchange_failed");
  }

  /*
    WHY `personal_info` IS FETCHED, AND WHY ALMOST NONE OF IT IS KEPT.

    Webhooks identify the person by Oura's own user id and carry nothing else
    that could match them to an ICEFALL account. `/v2/usercollection/personal_info`
    is the only place that id can be read, which is the entire reason the
    `personal` scope is requested.

    The response also carries age, weight, height and biological sex. None of it
    is stored. Nothing in ICEFALL consumes any of it today, and collecting more
    special-category data than a screen uses is the thing the consent wording
    would have to be widened to cover.
  */
  const who = await ouraGet("/usercollection/personal_info", { accessToken: tokens.accessToken });
  if (!who.ok || !who.data?.id) {
    console.error("[oura] personal_info failed:", who.reason || "no id", who.detail || "");
    return fail("identify_failed");
  }

  const saved = await saveNewConnection(
    { userId: state.userId, ouraUserId: String(who.data.id), tokens, scope: tokens.scope },
    env,
  );
  if (!saved.ok) {
    console.error("[oura] could not store connection:", saved.detail);
    return fail("store_failed");
  }

  /*
    The backfill is NOT run here. A serverless function has a wall clock, and a
    year of six collections does not fit inside it. The connection is marked
    `backfill_pending` and `/api/oura/backfill` walks it in slices — see below.
  */
  return back
    ? { status: 302, headers: { Location: withParams(back, { oura: "connected" }) }, body: { ok: true } }
    : { status: 200, body: { ok: true, connected: true } };
}

/* -- 3. tokens: refresh, and failing closed -------------------------------- */

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A usable access token for this connection, or the reason there is not one.
 *
 * ── FAILING CLOSED ──────────────────────────────────────────────────────────
 *
 * Every path out of this function is either a live token or a refusal. There is
 * no branch that returns "use the old one and hope", because the old one is how
 * a screen ends up showing last Tuesday's HRV as though it were this morning's.
 *
 * ── THE SINGLE-USE PROBLEM, STATED PLAINLY ──────────────────────────────────
 *
 * Oura's refresh tokens rotate: a refresh returns a new access token AND a new
 * refresh token, and kills the one that was sent. Two consequences follow, and
 * both are handled here rather than hoped away.
 *
 *   TWO PROCESSES MUST NOT REFRESH AT ONCE. The loser would store a token that
 *   was already dead, and which of the two ends up in the row would depend on
 *   write order. `claimRefresh` is a conditional UPDATE in Postgres, so the
 *   lock is visible to every instance rather than to one.
 *
 *   A LOST RESPONSE IS UNRECOVERABLE. If Oura issues the pair and the process
 *   dies before the row is written, the stored refresh token is dead and its
 *   replacement is gone. Nothing can retry that. The attempt is marked before
 *   it is made, so the next attempt can tell the difference between "never
 *   tried" and "tried, and we lost it", and report the second as what it is
 *   instead of retrying a dead token forever.
 *
 * @returns {Promise<{ok: true, accessToken: string} | {ok: false, reason: string, detail?: string}>}
 */
export async function freshAccessToken(connection, env) {
  if (!connection) return { ok: false, reason: "not-connected" };
  if (connection.state && connection.state !== "active") {
    return { ok: false, reason: connection.state, detail: connection.state_detail || "" };
  }

  // Two minutes of headroom: a token that expires mid-request is a token that
  // expired before the request, as far as the person looking at the screen is
  // concerned.
  const SKEW_MS = 120_000;
  const expiresAt = Date.parse(connection.access_token_expires_at || "");
  const stillGood = Number.isFinite(expiresAt) && expiresAt - Date.now() > SKEW_MS;

  if (stillGood) {
    const token = openToken(connection.access_token_sealed, env);
    if (token) return { ok: true, accessToken: token };
    /*
      The row exists and does not decrypt. That is a wrong or rotated
      OURA_TOKEN_KEY, not an expired grant, and it is reported as itself: a
      key that has been changed is fixed by putting the old one back, and
      telling the person to reconnect would destroy their history for nothing.
    */
    await markConnectionState(connection.id, "token-unreadable", "sealed token did not decrypt", env);
    return { ok: false, reason: "token-unreadable" };
  }

  const sealedRefresh = connection.refresh_token_sealed;
  if (!sealedRefresh) return { ok: false, reason: "reauthorise", detail: "no refresh token stored" };

  const refreshToken = openToken(sealedRefresh, env);
  if (!refreshToken) {
    await markConnectionState(connection.id, "token-unreadable", "sealed refresh did not decrypt", env);
    return { ok: false, reason: "token-unreadable" };
  }

  const claim = await claimRefresh(connection.id, env);
  if (!claim.ok) return { ok: false, reason: "store-unreachable", detail: claim.detail || "" };

  if (!claim.claimed) {
    /*
      Another instance holds the lock. Wait for its result rather than starting
      a second rotation — up to four seconds, in half-second steps, which fits
      inside the ten Oura allows a webhook and inside any reasonable page load.
      If it has not finished by then this call gives up; it does not overtake.
    */
    for (let i = 0; i < 8; i++) {
      await sleepMs(500);
      const again = await connectionForUser(connection.user_id, env);
      const c = again.ok ? again.connection : null;
      if (!c) break;
      if (c.state && c.state !== "active") return { ok: false, reason: c.state, detail: c.state_detail || "" };
      const exp = Date.parse(c.access_token_expires_at || "");
      if (Number.isFinite(exp) && exp - Date.now() > SKEW_MS) {
        const token = openToken(c.access_token_sealed, env);
        if (token) return { ok: true, accessToken: token };
      }
    }
    return { ok: false, reason: "refresh-busy" };
  }

  let rotated;
  try {
    rotated = await refreshTokens(refreshToken, ouraConfig(env));
  } catch (e) {
    if (e?.terminal) {
      /*
        `invalid_grant`. Two different things produce it and the person is told
        which we believe it was, because the sentences differ: they revoked
        ICEFALL in their Oura account, or a previous rotation was issued and
        never landed here. `refresh_in_flight_at` on the row is what separates
        them, and it was set before the call that failed.
      */
      const lost = Boolean(connection.refresh_in_flight_at);
      const state = lost ? "rotation-lost" : "reauthorise";
      await markConnectionState(connection.id, state, e.ouraError || e.message, env);
      return { ok: false, reason: state, detail: e.ouraError || "" };
    }
    /*
      A 500 or a timeout from Oura. NOT marked as reauthorise: the grant is
      probably fine and the next call will try again. The connection stays
      `active` and this request returns nothing, which is the correct amount of
      data to show when we could not reach the provider.
    */
    console.error("[oura] refresh failed, retryable:", e?.message || e);
    return { ok: false, reason: "provider-unreachable", detail: String(e?.message || e).slice(0, 200) };
  }

  const stored = await storeRotatedTokens(connection.id, rotated, env);
  if (!stored.ok) {
    /*
      THE WORST CASE, AND IT IS REACHED, NOT IGNORED. Oura has issued a new pair
      and the old refresh token is already dead; the store would not take the
      new one. Returning the access token anyway would work for a few hours and
      then strand the person with no way to explain it. The state is set so the
      next call says so — and if setting the state also fails, the in-flight
      mark left on the row is what the next attempt reads.
    */
    console.error("[oura] rotated tokens could not be stored:", stored.detail);
    await markConnectionState(connection.id, "rotation-lost", "new pair issued but not stored", env);
    return { ok: false, reason: "rotation-lost" };
  }

  return { ok: true, accessToken: rotated.accessToken };
}

/* -- 4. the webhook -------------------------------------------------------- */

/**
 * GET /api/oura/webhook — Oura's verification handshake.
 *
 * Oura calls this once when a subscription is created, with a token it was
 * given and a challenge to echo. THE TOKEN IS CHECKED. Echoing any challenge
 * that arrives would let a stranger point their own Oura application at our
 * callback and have it verified for them.
 */
export function handleOuraWebhookVerify(query = {}, { env = {} } = {}) {
  const expected = env.OURA_WEBHOOK_VERIFICATION_TOKEN || "";
  if (!expected) return notConfigured("webhook_verification_token_missing");

  const given = String(query.verification_token || "");
  const challenge = String(query.challenge || "");
  if (!given || !challenge || !safeEqual(given, expected)) {
    return { status: 403, body: { ok: false, error: "verification failed" } };
  }
  return { status: 200, body: { challenge } };
}

/**
 * POST /api/oura/webhook — one event.
 *
 * ── WHAT ARRIVES IS A DOORBELL, NOT A DELIVERY ──────────────────────────────
 *
 * The body is five fields: event_type, data_type, object_id, event_time,
 * user_id. NO HEALTH VALUE IS IN IT. The brief described REST as the "fallback"
 * for webhooks; it is not a fallback, it is the only thing that ever returns a
 * number, and the webhook exists to say which number to go and get.
 *
 * ── THE STATUS CODES ARE LOAD-BEARING ───────────────────────────────────────
 *
 * 2xx  processed, or deliberately dropped. No retry.
 * 5xx  we could not do it now. Oura retries roughly ten times over an hour,
 *      which is exactly what should happen when the provider rate-limited us.
 * 410  CANCELS THE SUBSCRIPTION. Subscriptions belong to the application, not
 *      to a person, so a 410 for one disconnected user silently stops delivery
 *      FOR EVERY ICEFALL USER. It is never returned from here. That is the
 *      single most expensive mistake available in this file.
 *
 * @param {object} ctx { env, rawBody, parsedBody, headers }
 */
export async function handleOuraWebhook({ env = {}, rawBody = "", parsedBody = null, headers = {} } = {}) {
  const ready = ouraReady(env);
  if (!ready.ready) {
    // Deliberately 503, not 200: unconfigured is a state that gets fixed, and a
    // retry after it is fixed is data we would otherwise have thrown away.
    return { status: 503, body: { ok: false, code: "not_configured", reason: ready.reason } };
  }

  const header = (n) => {
    const v = headers[n] ?? headers[n.toLowerCase()];
    return Array.isArray(v) ? v[0] : v || "";
  };

  const check = verifyWebhookSignature(
    {
      rawBody,
      parsedBody,
      signature: header("x-oura-signature"),
      timestamp: header("x-oura-timestamp"),
    },
    env,
  );
  if (!check.ok) {
    /*
      403 rather than 401, and no retry is wanted: a request that cannot be
      shown to come from Oura is not a delivery that failed, it is somebody
      else. Without this check the endpoint would be a public URL that writes
      heart-rate rows onto a named stranger's record on request.
    */
    console.warn("[oura] webhook rejected:", check.reason);
    return { status: 403, body: { ok: false, error: "signature" } };
  }

  const event = parsedBody && typeof parsedBody === "object" ? parsedBody : null;
  if (!event?.user_id || !event?.data_type || !event?.event_type || !event?.object_id) {
    return { status: 400, body: { ok: false, error: "malformed event" } };
  }

  /*
    DUPLICATES. Oura retries on any non-2xx, and a slow response can be retried
    while the first is still running, so the same event arrives more than once
    as a matter of course. The event is recorded first and only marked processed
    at the end — so a delivery we failed to act on is still `fresh` on the retry
    rather than deduplicated into silence.
  */
  const seen = await recordWebhookEvent(event, env);
  if (!seen.ok) return { status: 503, body: { ok: false, error: "store" } };
  if (!seen.fresh) return { status: 200, body: { ok: true, duplicate: true } };

  const found = await connectionForOuraUser(String(event.user_id), env);
  if (!found.ok) return { status: 503, body: { ok: false, error: "store" } };

  const connection = found.connection;
  /*
    A WEBHOOK FOR SOMEBODY WHO DISCONNECTED.

    Expected, not exceptional: subscriptions are per application, so Oura keeps
    notifying us about every person who ever authorised ICEFALL, including
    people whose rows we have deleted. It is acknowledged and dropped — 200, so
    no retry, and NOT 410, which would cancel the subscription for everyone.

    Nothing is written. The event row is the only trace, and it holds an Oura
    user id and no health value, which is what makes it safe to keep after
    erasure.
  */
  if (!connection || (connection.state && connection.state !== "active")) {
    await serviceRpc("oura_mark_event_processed", { p_event: seen.eventId, p_outcome: "no-connection" }, env);
    return { status: 200, body: { ok: true, ignored: "no-connection" } };
  }

  const collection = WEBHOOK_TO_COLLECTION[event.data_type];
  if (!collection) {
    // A data type we have not built for. Not an error — Oura ships collections
    // faster than ICEFALL adds screens for them.
    await serviceRpc("oura_mark_event_processed", { p_event: seen.eventId, p_outcome: "unhandled-type" }, env);
    return { status: 200, body: { ok: true, ignored: "unhandled-type" } };
  }

  if (event.event_type === "delete") {
    /*
      Oura deleted the object. Ours goes too. A row that Oura no longer stands
      behind is a measurement with no source, and keeping it would mean the app
      shows a night the person's own ring app does not.
    */
    const gone = await serviceRpc(
      "oura_delete_object",
      { p_user: connection.user_id, p_kind: collection, p_object_id: String(event.object_id) },
      env,
    );
    await serviceRpc("oura_mark_event_processed", { p_event: seen.eventId, p_outcome: gone.ok ? "deleted" : "delete-failed" }, env);
    return gone.ok
      ? { status: 200, body: { ok: true, deleted: true } }
      : { status: 503, body: { ok: false, error: "store" } };
  }

  const token = await freshAccessToken(connection, env);
  if (!token.ok) {
    /*
      No usable token. Whether Oura should retry depends on which failure it is:
      a provider blip or a busy lock will pass, a revoked grant never will and
      retrying it ten times an hour helps nobody.
    */
    const retryable = ["provider-unreachable", "refresh-busy", "store-unreachable"].includes(token.reason);
    await serviceRpc("oura_mark_event_processed", { p_event: seen.eventId, p_outcome: `token-${token.reason}` }, env);
    return retryable
      ? { status: 503, body: { ok: false, error: token.reason } }
      : { status: 200, body: { ok: true, ignored: token.reason } };
  }

  const doc = await ouraGet(`/usercollection/${collection}/${encodeURIComponent(String(event.object_id))}`, {
    accessToken: token.accessToken,
  });

  if (!doc.ok) {
    if (doc.reason === "reauthorise" || doc.reason === "membership-lapsed") {
      await markConnectionState(connection.id, doc.reason, doc.detail, env);
      await serviceRpc("oura_mark_event_processed", { p_event: seen.eventId, p_outcome: doc.reason }, env);
      return { status: 200, body: { ok: true, ignored: doc.reason } };
    }
    if (doc.reason === "not-found") {
      await serviceRpc("oura_mark_event_processed", { p_event: seen.eventId, p_outcome: "not-found" }, env);
      return { status: 200, body: { ok: true, ignored: "not-found" } };
    }
    // Rate limited, or Oura is unwell. Ask to be told again.
    return { status: 503, body: { ok: false, error: doc.reason } };
  }

  const written = await writeDocument({
    userId: connection.user_id,
    collection,
    document: doc.data,
    sourceEventAt: event.event_time,
    env,
  });
  if (!written.ok) return { status: 503, body: { ok: false, error: "store" } };

  await serviceRpc("oura_mark_event_processed", { p_event: seen.eventId, p_outcome: "stored" }, env);

  // Bounded, opportunistic, and not a substitute for a scheduled job — see the
  // note on `pruneExpired`.
  pruneExpired(env, 200).catch(() => {});

  return { status: 200, body: { ok: true, stored: true, day: written.day } };
}

/** Map one Oura document into our columns and write it idempotently. */
async function writeDocument({ userId, collection, document, sourceEventAt, env }) {
  const spec = COLLECTIONS[collection];
  if (!spec) return { ok: false, detail: "unknown collection" };

  const row = spec.map(document);
  if (!row.day) return { ok: false, detail: "document has no day" };

  const res = await upsertDay({
    userId,
    day: row.day,
    kind: spec.kind,
    payload: row,
    sourceEventAt: sourceEventAt || nowIso(),
    ouraObjectId: row.oura_id,
  });
  return res.ok ? { ok: true, day: row.day } : { ok: false, detail: res.detail };
}

/* -- 5. the backfill ------------------------------------------------------- */

/**
 * POST /api/oura/backfill — one bounded slice of history.
 *
 * ── WHY IT IS A SLICE AND NOT A JOB ─────────────────────────────────────────
 *
 * There is no worker and no queue in this deployment; there are serverless
 * functions with a wall clock. A month of six collections does not reliably fit
 * in one, so this does one collection per call, reports where it got to, and
 * expects to be called again. The caller loops until `done`.
 *
 * That also makes it rate-limit-shaped. Oura's per-application ceiling is
 * shared by every ICEFALL user, so a backfill that ran flat out would spend
 * everyone's allowance; stopping at a page cap and being called back spreads it.
 *
 * @param {object} body { days?, collection? }
 */
export async function handleOuraBackfill(body, { env = {}, ip = "", bearer = "" } = {}) {
  const ready = ouraReady(env);
  if (!ready.ready) return notConfigured(ready.reason);

  if (rateLimited("oura-backfill", ip, { windowMs: 60_000, max: 30 })) {
    return { status: 429, body: { ok: false, error: "Too many attempts. Try again in a minute." } };
  }

  const user = await userFromBearer(bearer, env);
  if (!user) return { status: 401, body: { ok: false, code: "not_signed_in", error: "Sign in first." } };

  const consent = await consentGranted(user.id, env);
  if (!consent.granted) {
    return { status: 403, body: { ok: false, code: "consent_required", reason: consent.reason } };
  }

  const found = await connectionForUser(user.id, env);
  if (!found.ok) return { status: 502, body: { ok: false, error: "store" } };
  if (!found.connection) return { status: 404, body: { ok: false, code: "not_connected" } };

  const token = await freshAccessToken(found.connection, env);
  if (!token.ok) {
    return { status: 200, body: { ok: false, connected: false, reason: token.reason, detail: token.detail || "" } };
  }

  const days = Math.min(
    MAX_BACKFILL_DAYS,
    Math.max(1, Number(body?.days) || Number(env.OURA_BACKFILL_DAYS) || DEFAULT_BACKFILL_DAYS),
  );
  const requested = String(body?.collection || "");
  const remaining = BACKFILL_ORDER.filter((c) => !requested || c === requested);
  const collection = remaining[0];
  if (!collection) return { status: 400, body: { ok: false, error: "unknown collection" } };

  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);

  const page = await ouraCollection(collection, {
    accessToken: token.accessToken,
    startDate: isoDay(start),
    endDate: isoDay(end),
    fields: COLLECTION_FIELDS[collection],
    cursor: String(body?.cursor || ""),
  });

  if (!page.ok) {
    if (page.reason === "reauthorise" || page.reason === "membership-lapsed") {
      await markConnectionState(found.connection.id, page.reason, page.detail, env);
    }
    return { status: 200, body: { ok: false, reason: page.reason, detail: page.detail || "" } };
  }

  let written = 0;
  let skipped = 0;
  for (const document of page.rows) {
    const res = await writeDocument({
      userId: user.id,
      collection,
      document,
      // A backfilled row is older evidence than any webhook that has already
      // landed for the same day. Timestamping it `now` would let a month-old
      // fetch overwrite this morning's live update, so the day itself is the
      // event time and the store's monotonic guard does the rest.
      sourceEventAt: `${document?.day || isoDay(start)}T00:00:00.000Z`,
      env,
    });
    if (res.ok) written++;
    else skipped++;
  }

  const nextCollection = page.partial ? collection : BACKFILL_ORDER[BACKFILL_ORDER.indexOf(collection) + 1] || "";
  const done = !page.partial && !nextCollection;

  if (done) await serviceRpc("oura_mark_backfilled", { p_connection: found.connection.id }, env);

  return {
    status: 200,
    body: {
      ok: true,
      collection,
      days,
      written,
      skipped,
      done,
      next: done ? null : { collection: nextCollection || collection, cursor: page.partial ? page.cursor : "" },
    },
  };
}

/* -- 6. the read the app consumes ------------------------------------------ */

/**
 * GET /api/oura/summary — the latest measurements, or the reason there are none.
 *
 * ── IT RUNS ON THE CALLER'S OWN TOKEN ───────────────────────────────────────
 *
 * No elevated credential is used anywhere in this path. The RPC filters on
 * `auth.uid()` inside the database, so the worst a bug in this file can do is
 * ask for the wrong shape — it cannot ask for somebody else's sleep.
 *
 * ── AN EXPIRED GRANT RETURNS NO NUMBERS ─────────────────────────────────────
 *
 * When the connection is not working, this returns the reason and no values,
 * even though rows for last week are sitting in the table. They are true about
 * last week and they are not an answer to "how did they sleep"; presenting them
 * under a live-looking tile is exactly the stale-as-current failure the brief
 * names. History is a different question and deliberately not this endpoint.
 *
 * ── AND A STALE READING IS NOT A READING ────────────────────────────────────
 *
 * Even on a healthy connection, a value older than the freshness window comes
 * back as `no-recent-data`. That is what a silently-expired webhook
 * subscription looks like from here, and it is also what a ring in a drawer
 * looks like; both should read as "we do not know", not as Tuesday's number.
 */
export async function handleOuraSummary({ env = {}, ip = "", bearer = "" } = {}) {
  if (!readConfigured(env)) return notConfigured("supabase_not_configured");

  if (rateLimited("oura-summary", ip, { windowMs: 60_000, max: 60 })) {
    return { status: 429, body: { ok: false, error: "Too many requests." } };
  }

  const user = await userFromBearer(bearer, env);
  if (!user) return { status: 401, body: { ok: false, code: "not_signed_in", error: "Sign in first." } };

  const res = await userRpc("oura_my_summary", {}, bearer, env);
  if (!res.ok) {
    // Logged, not returned. A database error message is for us; handing it to
    // the caller tells a stranger the shape of the schema for no benefit.
    console.error("[oura] summary read failed:", res.detail);
    return { status: 502, body: { ok: false, error: "store" } };
  }

  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  if (!row || !row.state) {
    return { status: 200, body: { ok: true, connected: false, reason: "not-connected", metrics: {} } };
  }
  if (row.state !== "active") {
    return { status: 200, body: { ok: true, connected: false, reason: row.state, metrics: {} } };
  }

  const freshnessDays = Math.max(
    1,
    Number(env.OURA_FRESHNESS_DAYS) || DEFAULT_FRESHNESS_DAYS,
  );
  const cutoff = isoDay(new Date(Date.now() - freshnessDays * 86_400_000));

  /*
    EVERY VALUE CARRIES ITS SOURCE.

    Oura is a THIRD health source beside Apple Health and Health Connect, and
    the two can report the same person's resting heart rate — Oura's own app
    writes into Apple Health, so the duplicate is guaranteed rather than
    hypothetical. Whichever resolver the app settles on, it cannot choose
    without knowing which ring or phone a number came from, so the origin
    travels with the number and not in a comment.
  */
  const measured = (value, unit, day, extra = {}) =>
    value === null || value === undefined
      ? { value: null, reason: "no-data", source: "oura" }
      : day && day < cutoff
        ? { value: null, reason: "no-recent-data", source: "oura", measuredOn: day }
        : { value, unit, source: "oura", measuredOn: day, ...extra };

  const sleep = row.sleep || {};
  const readiness = row.readiness || {};
  const dailySleep = row.daily_sleep || {};
  const activity = row.activity || {};
  const spo2 = row.spo2 || {};
  const stress = row.stress || {};

  return {
    status: 200,
    body: {
      ok: true,
      connected: true,
      source: "oura",
      freshnessDays,
      backfill: row.backfill_state || "unknown",
      metrics: {
        /* Measurements — every one of these has a unit and came off the ring. */
        hrv: measured(sleep.average_hrv_ms ?? null, "ms", sleep.day),
        restingHeartRate: measured(sleep.lowest_heart_rate_bpm ?? null, "bpm", sleep.day),
        averageHeartRate: measured(sleep.average_heart_rate_bpm ?? null, "bpm", sleep.day),
        respiratoryRate: measured(sleep.average_breath_per_min ?? null, "breaths/min", sleep.day),
        sleepMinutes: measured(sleep.total_sleep_min ?? null, "min", sleep.day),
        deepSleepMinutes: measured(sleep.deep_sleep_min ?? null, "min", sleep.day),
        remSleepMinutes: measured(sleep.rem_sleep_min ?? null, "min", sleep.day),
        sleepEfficiency: measured(sleep.efficiency_pct ?? null, "%", sleep.day),
        spo2: measured(spo2.spo2_average_pct ?? null, "%", spo2.day),
        temperatureDeviation: measured(readiness.temperature_deviation_c ?? null, "°C", readiness.day),
        steps: measured(activity.steps ?? null, "", activity.day),
        activeCalories: measured(activity.active_calories_kcal ?? null, "kcal", activity.day),
        stressHighMinutes: measured(stress.stress_high_min ?? null, "min", stress.day),
        recoveryHighMinutes: measured(stress.recovery_high_min ?? null, "min", stress.day),

        /*
          Scores — 0 to 100, no unit, and named so nothing can render one as a
          pulse. `readinessScore` is Oura's opinion, not ICEFALL's readiness,
          and the two must not be conflated on a screen either.
        */
        readinessScore: measured(readiness.readiness_score ?? null, "score", readiness.day),
        sleepScore: measured(dailySleep.sleep_score ?? null, "score", dailySleep.day),
        activityScore: measured(activity.activity_score ?? null, "score", activity.day),
        hrvBalanceScore: measured(readiness.hrv_balance_score ?? null, "score", readiness.day),
        restingHeartRateScore: measured(readiness.resting_heart_rate_score ?? null, "score", readiness.day),
      },
      /*
        The ring's own excuses, passed through. A night with no HRV because the
        battery died is a different sentence from a night not worn, and only
        Oura knows which.
      */
      context: {
        lowBatteryLastNight: sleep.low_battery_alert ?? null,
        lastSleepPeriodType: sleep.period_type ?? null,
        nonWearMinutes: activity.non_wear_min ?? null,
      },
    },
  };
}

/* -- 7. disconnect --------------------------------------------------------- */

/**
 * POST /api/oura/disconnect — delete, and be honest about revocation.
 *
 * ── WHAT THIS DOES ──────────────────────────────────────────────────────────
 *
 * Deletes every Oura row ICEFALL holds for this person — the sleep periods, the
 * daily summaries, the connection and its tokens — and records the consent
 * withdrawal. Deletion, not deactivation: a disconnect that only forgets a
 * token leaves a heart-rate history in a database the person believes they
 * cleared.
 *
 * ── WHAT IT CANNOT DO, AND SAYS SO ──────────────────────────────────────────
 *
 * OURA PUBLISHES NO TOKEN-REVOCATION ENDPOINT. Nothing in the v2 OpenAPI
 * document or the authentication docs accepts a token and invalidates it. So
 * ICEFALL cannot revoke at Oura's end, and the response says that in as many
 * words rather than reporting a revocation it did not perform. The person
 * removes ICEFALL in their own Oura account, and the copy tells them where.
 *
 * Claiming a revocation we did not perform is the same class of failure as
 * showing a number we did not measure, which is why this is not smoothed over.
 */
export async function handleOuraDisconnect(body, { env = {}, ip = "", bearer = "" } = {}) {
  if (!readConfigured(env)) return notConfigured("supabase_not_configured");
  if (!storeWritable(env)) return notConfigured("server_credentials_missing");

  if (rateLimited("oura-disconnect", ip, { windowMs: 60_000, max: 10 })) {
    return { status: 429, body: { ok: false, error: "Too many attempts. Try again in a minute." } };
  }

  const user = await userFromBearer(bearer, env);
  if (!user) return { status: 401, body: { ok: false, code: "not_signed_in", error: "Sign in first." } };

  const gone = await deleteEverything(user.id, String(body?.reason || "user-disconnect"), env);
  if (!gone.ok) {
    console.error("[oura] delete failed:", gone.detail);
    return {
      status: 502,
      body: {
        ok: false,
        // Said plainly, because the person needs to know their data is still
        // there and to try again — not to be reassured by a vague apology.
        error: "We couldn't remove your ring data just now. Nothing was deleted — please try again.",
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      deleted: gone.deleted,
      revocation: {
        performed: false,
        reason: "provider-has-no-revocation-endpoint",
        // Shown verbatim. It is a refusal, and refusals are not paraphrased.
        message:
          "Your ring data has been deleted from ICEFALL and we have forgotten your access tokens. Oura provides no way for us to cancel the permission at their end, so ICEFALL will still be listed in your Oura account until you remove it there.",
        where: "Oura app → Settings → Account → Connected apps",
      },
    },
  };
}
