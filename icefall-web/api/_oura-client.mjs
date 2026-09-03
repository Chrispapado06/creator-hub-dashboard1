/**
 * Oura Ring — everything that talks to Oura. No Supabase, no request handling.
 *
 * Split out of `_oura.mjs` for the reason `_ratelimit.mjs` was split out of
 * `_waitlist.mjs`: the OAuth URLs, the signature scheme and the rate-limit
 * headers are facts about a third party, and a second copy of a fact that can
 * change is the drift this codebase keeps paying for.
 *
 * ── THE SPEC WE WERE HANDED WAS WRONG ABOUT THE URLS ────────────────────────
 *
 * The brief gave every endpoint as `https://ouraring.com/...`. The real hosts
 * differ from that AND from each other:
 *
 *     authorize   https://cloud.ouraring.com/oauth/authorize
 *     token       https://api.ouraring.com/oauth/token      <- different host
 *     refresh     https://api.ouraring.com/oauth/token      <- same as token
 *     data        https://api.ouraring.com/v2/...
 *
 * Verified against the live OpenAPI document (openapi-1.37) that
 * https://api.ouraring.com/v2/docs renders, plus cloud.ouraring.com/docs.
 *
 * ── THE SCOPES IN THE BRIEF DO NOT EXIST ────────────────────────────────────
 *
 * `daily_readiness`, `daily_sleep`, `daily_activity` and `personal_info` are
 * ENDPOINT names. Oura's scopes are a different, shorter list, and all three
 * daily summaries come from the single scope `daily`. Asking for the four
 * strings in the brief would have produced a grant covering nothing.
 *
 * `OURA_SCOPES` overrides the default below without a code change, because one
 * scope string is genuinely disputed between two live Oura sources — the HTML
 * docs say `spo2`, the OpenAPI document says `spo2Daily` — and this is settled
 * by trying it against the authorize endpoint, not by reading harder.
 *
 * ── THE CLIENT SECRET ───────────────────────────────────────────────────────
 *
 * Used in exactly three places, all of them here, all of them server-side:
 * the token exchange, every refresh, and the HMAC on incoming webhooks. It is
 * read from the environment at call time and never returned by any function in
 * this file. Nothing in this module is reachable from a browser.
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/* -- the real endpoints ---------------------------------------------------- */

export const OURA_AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
export const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
export const OURA_API_BASE = "https://api.ouraring.com/v2";
export const OURA_SUBSCRIPTION_URL = "https://api.ouraring.com/v2/webhook/subscription";

/**
 * Default scopes.
 *
 * `daily` covers daily_sleep, daily_readiness, daily_activity and — as far as
 * any published Oura source says — the newer daily_stress, daily_resilience,
 * daily_cardiovascular_age and vo2_max collections too. THAT LAST PART IS NOT
 * CONFIRMED by Oura's documentation; it is an inference from the scope list
 * being shorter than the collection list. If those collections come back 401
 * on a real token, the scope is the first thing to suspect.
 *
 * `spo2` is the string the HTML docs use. The OpenAPI document says `spo2Daily`.
 * Override with OURA_SCOPES rather than editing this line.
 *
 * `email` is deliberately absent. ICEFALL already knows the person's email —
 * asking Oura for it again widens the grant and buys nothing.
 */
const DEFAULT_SCOPES = "personal daily heartrate workout session spo2";

/** Reads config at call time, not module load — serverless envs land late. */
export function ouraConfig(env = {}) {
  const clientId = env.OURA_CLIENT_ID || "";
  const clientSecret = env.OURA_CLIENT_SECRET || "";
  const redirectUri = env.OURA_REDIRECT_URI || "";
  if (!clientId || !clientSecret || !redirectUri) return null;
  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: (env.OURA_SCOPES || DEFAULT_SCOPES).trim(),
  };
}

export function ouraConfigured(env = {}) {
  return Boolean(ouraConfig(env));
}

/* -- the state parameter --------------------------------------------------- */

/**
 * A signed, self-contained `state`.
 *
 * IT IS NOT A RANDOM STRING IN A SESSION MAP, and that is the whole point. This
 * runs as serverless functions: the instance that builds the authorize URL is
 * usually not the instance the callback lands on, so an in-memory nonce store
 * would reject its own valid states some fraction of the time and the failure
 * would look random. The signature moves the trust into the value itself.
 *
 * WHAT IT DEFENDS. The attack `state` exists to stop is an attacker binding
 * THEIR ring to YOUR ICEFALL account by feeding you their authorization code.
 * That needs a state naming your user id, which needs OURA_STATE_SECRET. An
 * attacker can mint states for their own account all day; the ring lands on
 * their own account, which is where it already was.
 *
 * WHAT IT DOES NOT DEFEND. Replay of a state inside its ten-minute window. The
 * code it arrives with is single-use at Oura's end, so the second exchange
 * fails there rather than here — this is Oura's guarantee, not ours, and it is
 * named as theirs on purpose.
 */
const STATE_TTL_MS = 10 * 60 * 1000;

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function stateSecret(env) {
  const s = env.OURA_STATE_SECRET || "";
  return s.length >= 32 ? s : "";
}

export function signState({ userId, returnKey }, env, now = Date.now()) {
  const secret = stateSecret(env);
  if (!secret) return null;
  const payload = b64url(
    JSON.stringify({ u: userId, r: returnKey || "", t: now, n: randomBytes(9).toString("base64url") }),
  );
  const mac = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

/** @returns {{userId: string, returnKey: string} | null} — null means do not trust it. */
export function verifyState(state, env, now = Date.now()) {
  const secret = stateSecret(env);
  if (!secret || typeof state !== "string") return null;

  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = state.slice(0, dot);
  const given = state.slice(dot + 1);

  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(given, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.u !== "string" || !parsed.u) return null;
    if (typeof parsed.t !== "number" || now - parsed.t > STATE_TTL_MS || parsed.t - now > 60_000) {
      return null;
    }
    return { userId: parsed.u, returnKey: typeof parsed.r === "string" ? parsed.r : "" };
  } catch {
    return null;
  }
}

/** Constant-time string compare that does not leak length through an exception. */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function authorizeUrl({ state }, cfg) {
  const u = new URL(OURA_AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("scope", cfg.scopes);
  u.searchParams.set("state", state);
  return u.toString();
}

/* -- token exchange and refresh -------------------------------------------- */

/**
 * Both halves of the OAuth code path. SERVER SIDE ONLY — see the file header.
 *
 * `expires_in` IS READ, NOT ASSUMED. Oura's FAQ says access tokens "typically"
 * last 30 days and its auth page gives 30 days for a flow we do not use. A
 * hardcoded 30 days would be a number we did not measure.
 */
async function tokenRequest(form, cfg) {
  const body = new URLSearchParams({ ...form, client_id: cfg.clientId, client_secret: cfg.clientSecret });

  const res = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });

  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* handled below — a non-JSON body from the token endpoint is a failure */
  }

  if (!res.ok || !json?.access_token) {
    const err = new Error(`oura token ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    // `invalid_grant` is the one that means "this will never work again".
    err.terminal = res.status === 400 || res.status === 401 || json?.error === "invalid_grant";
    err.ouraError = json?.error || "";
    throw err;
  }

  const expiresIn = Number(json.expires_in);
  return {
    accessToken: String(json.access_token),
    // Oura returns a refresh token on the server-side flow. If one is ever
    // absent the connection is still usable until the access token expires,
    // and `null` records that honestly instead of storing the string "undefined".
    refreshToken: json.refresh_token ? String(json.refresh_token) : null,
    // No fallback lifetime. An absent or nonsensical `expires_in` is a token we
    // cannot say the expiry of, so it is treated as already expired and the
    // next call refreshes — wrong-but-safe beats a guessed 30 days.
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : new Date(Date.now() - 1000).toISOString(),
    scope: typeof json.scope === "string" ? json.scope : "",
    tokenType: typeof json.token_type === "string" ? json.token_type : "",
  };
}

export function exchangeCode(code, cfg) {
  return tokenRequest(
    { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri },
    cfg,
  );
}

/**
 * REFRESH TOKENS ARE SINGLE USE.
 *
 * Each refresh returns a new access token AND a new refresh token, and kills
 * the one that was sent. That makes this the most dangerous call in the
 * integration: if the response is lost between Oura issuing it and us storing
 * it, the person is disconnected permanently and no retry can help, because
 * the token we would retry with is already dead.
 *
 * This function does not solve that on its own. The store records the attempt
 * before it is made and only clears the mark once the new pair is written —
 * see `_oura-store.mjs`. What this function guarantees is narrower: it returns
 * the whole new pair or it throws, and never a half.
 */
export function refreshTokens(refreshToken, cfg) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, cfg);
}

/* -- rate limiting --------------------------------------------------------- */

/**
 * Oura publishes NO rate-limit numbers, and its own document contradicts itself
 * about it: the Rate Limits section describes two unpublished layers (per token
 * and per application) and tells you to read the response headers, while the
 * FAQ in the same file still says 5000 requests per 5 minutes. Both cannot be
 * current, so this builds against the headers and hardcodes no ceiling.
 *
 * The per-APPLICATION layer is the one that matters: it aggregates every
 * ICEFALL user's traffic, so a 429 earned by a backfill is a 429 for everybody.
 * That is why the pause below is module-wide rather than per user.
 *
 * HONEST ABOUT WHAT THIS IS. Per-instance state on a platform that runs many
 * instances, exactly like `_ratelimit.mjs`. It makes one process well-behaved
 * and it is exactly correct locally. It cannot coordinate a fleet.
 */
let pausedUntil = 0;

export function ouraPausedFor(now = Date.now()) {
  return Math.max(0, pausedUntil - now);
}

function noteRateLimit(res, now = Date.now()) {
  const retryAfter = Number(res.headers.get("retry-after"));
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1000
    : Number.isFinite(reset) && reset > 0
      ? Math.min(reset * 1000, 300_000)
      : 30_000;
  pausedUntil = Math.max(pausedUntil, now + waitMs);
  return waitMs;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One authenticated GET against the Oura API, with the failure modes named.
 *
 * @returns {Promise<{ok: true, data: object} | {ok: false, reason: string, status: number, detail: string}>}
 *
 * Reasons, and what each one MEANS to a screen:
 *   rate-limited        we backed off and gave up; try later, show nothing new
 *   reauthorise         401 — the grant is gone; the person must reconnect
 *   membership-lapsed   403 — Oura's own answer when a subscription ends
 *   not-found           404 — the object the webhook named is not there
 *   provider-error      anything else, including a network failure
 */
export async function ouraGet(path, { accessToken, query = {}, attempts = 3 } = {}) {
  const url = new URL(`${OURA_API_BASE}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  for (let i = 0; i < attempts; i++) {
    const wait = ouraPausedFor();
    if (wait > 0) {
      // A backfill can afford to wait a little; a webhook cannot. Two seconds
      // is the compromise, and the caller is told when it was not enough.
      if (wait > 2000) return { ok: false, reason: "rate-limited", status: 429, detail: `paused ${wait}ms` };
      await sleep(wait);
    }

    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
    } catch (e) {
      if (i === attempts - 1) {
        return { ok: false, reason: "provider-error", status: 0, detail: String(e?.message || e) };
      }
      await sleep(500 * (i + 1));
      continue;
    }

    if (res.status === 429) {
      const waited = noteRateLimit(res);
      if (i === attempts - 1) {
        return { ok: false, reason: "rate-limited", status: 429, detail: `retry after ${waited}ms` };
      }
      await sleep(Math.min(waited, 3000));
      continue;
    }

    const text = await res.text().catch(() => "");

    if (res.status === 401) return { ok: false, reason: "reauthorise", status: 401, detail: text.slice(0, 200) };
    // Oura documents 403 as "the user's Oura membership has lapsed". That is a
    // different sentence from "you are logged out" and the person must be told
    // which one it is, so it does not collapse into `reauthorise`.
    if (res.status === 403) return { ok: false, reason: "membership-lapsed", status: 403, detail: text.slice(0, 200) };
    if (res.status === 404) return { ok: false, reason: "not-found", status: 404, detail: text.slice(0, 200) };

    if (!res.ok) {
      if (res.status >= 500 && i < attempts - 1) {
        await sleep(500 * (i + 1));
        continue;
      }
      return { ok: false, reason: "provider-error", status: res.status, detail: text.slice(0, 300) };
    }

    try {
      return { ok: true, data: text ? JSON.parse(text) : {} };
    } catch (e) {
      return { ok: false, reason: "provider-error", status: res.status, detail: String(e?.message || e) };
    }
  }

  return { ok: false, reason: "provider-error", status: 0, detail: "exhausted attempts" };
}

/**
 * A whole date-ranged collection, following `next_token` to the end.
 *
 * `pageCap` exists because a serverless function has a wall clock. Hitting it
 * returns `partial: true` and the cursor, so the caller resumes rather than
 * silently returning a short answer that looks complete.
 */
export async function ouraCollection(
  collection,
  { accessToken, startDate, endDate, fields, pageCap = 8, cursor = "" } = {},
) {
  const rows = [];
  let next = cursor;

  for (let page = 0; page < pageCap; page++) {
    const r = await ouraGet(`/usercollection/${collection}`, {
      accessToken,
      query: {
        start_date: startDate,
        end_date: endDate,
        next_token: next || undefined,
        // Data minimisation enforced at the REQUEST, not at the insert: if a
        // column is not in our schema we do not ask Oura to send it.
        fields: fields && fields.length ? fields.join(",") : undefined,
      },
    });
    if (!r.ok) return { ...r, rows };

    const data = Array.isArray(r.data?.data) ? r.data.data : [];
    rows.push(...data);
    next = r.data?.next_token || "";
    if (!next) return { ok: true, rows, partial: false, cursor: "" };
  }

  return { ok: true, rows, partial: true, cursor: next };
}

/* -- webhook signature ----------------------------------------------------- */

/**
 * Oura signs each webhook with HMAC-SHA256 over `timestamp + body`, keyed with
 * the OAUTH CLIENT SECRET, hex, uppercase.
 *
 * ── WHY TWO CANDIDATES ARE CHECKED ──────────────────────────────────────────
 *
 * Oura's own wording is `timestamp + JSON.stringify(body)`, i.e. the body as
 * THEIR serialiser wrote it. Our serialiser is not guaranteed to reproduce it
 * byte for byte — key order and spacing are not part of JSON's contract — so
 * verifying against a re-serialised body can fail on a genuine request. The raw
 * bytes are checked first because they are what actually arrived; the
 * re-serialised form is the fallback for a transport that has already parsed.
 *
 * Accepting either does not weaken anything: both candidates require the
 * client secret to produce, and an attacker without it can satisfy neither.
 *
 * ── WHAT AN UNVERIFIED ENDPOINT WOULD BE ────────────────────────────────────
 *
 * A public URL that writes heart-rate rows into the database on request. The
 * signature is the only thing standing between this integration and anybody on
 * the internet editing a stranger's health record, so a missing or unparseable
 * signature is refused rather than logged and waved through.
 */
const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

export function verifyWebhookSignature(
  { rawBody, parsedBody, signature, timestamp },
  env,
  now = Date.now(),
) {
  const secret = env.OURA_CLIENT_SECRET || "";
  if (!secret) return { ok: false, reason: "not_configured" };
  if (!signature || !timestamp) return { ok: false, reason: "missing_signature" };

  // A replayed-but-genuine delivery is still somebody else's copy of a real
  // event. The timestamp is inside the signed material, so an attacker cannot
  // move it; this only bounds how long a captured request stays usable.
  const ts = Date.parse(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SIGNATURE_MAX_SKEW_MS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const candidates = [];
  if (typeof rawBody === "string" && rawBody.length) candidates.push(rawBody);
  if (parsedBody && typeof parsedBody === "object") {
    try {
      candidates.push(JSON.stringify(parsedBody));
    } catch {
      /* an unserialisable body cannot have been sent as JSON; the raw form stands */
    }
  }
  if (!candidates.length) return { ok: false, reason: "empty_body" };

  const given = String(signature).trim();
  for (const candidate of candidates) {
    const mac = createHmac("sha256", secret).update(timestamp + candidate).digest("hex");
    if (safeEqual(given.toLowerCase(), mac.toLowerCase())) return { ok: true };
  }
  return { ok: false, reason: "bad_signature" };
}

/* -- webhook subscription administration ----------------------------------- */

/**
 * Subscription management authenticates with `x-client-id` + `x-client-secret`,
 * NOT a user's bearer token. Subscriptions belong to the application, not to a
 * person — which is why nothing here is reachable from a request handler, and
 * why `server/oura-subscriptions.mjs` is an operator command rather than an
 * endpoint. It is also why a webhook for someone who has disconnected must
 * never be answered with 410: that response cancels the subscription for EVERY
 * ICEFALL user at once.
 */
export const WEBHOOK_EVENT_TYPES = ["create", "update", "delete"];

/**
 * The data types we subscribe to. `meal` is in Oura's enum and is deliberately
 * absent here: it can be notified but there is no `/v2/usercollection/meal` to
 * fetch, so a subscription to it produces events we could never act on.
 */
export const WEBHOOK_DATA_TYPES = [
  "sleep",
  "daily_sleep",
  "daily_readiness",
  "daily_activity",
  "daily_spo2",
  "daily_stress",
];

async function subscriptionRequest(method, path, env, body) {
  const clientId = env.OURA_CLIENT_ID || "";
  const clientSecret = env.OURA_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("OURA_CLIENT_ID / OURA_CLIENT_SECRET not set");

  const res = await fetch(`${OURA_SUBSCRIPTION_URL}${path}`, {
    method,
    headers: {
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`oura subscription ${method} ${res.status}: ${text.slice(0, 400)}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export const listSubscriptions = (env) => subscriptionRequest("GET", "", env);

export const createSubscription = (env, { callbackUrl, eventType, dataType }) =>
  subscriptionRequest("POST", "", env, {
    callback_url: callbackUrl,
    verification_token: env.OURA_WEBHOOK_VERIFICATION_TOKEN || "",
    event_type: eventType,
    data_type: dataType,
  });

/**
 * Subscriptions expire. `expiration_time` is on every subscription and this
 * endpoint exists to push it out — but OURA PUBLISHES NO EXPIRY PERIOD, so the
 * renewal interval cannot be derived from the documentation. It has to be read
 * off a real subscription after creating one. Until it is, an unrenewed
 * subscription stops delivering silently, which is why stale rows age out into
 * "no recent data" rather than sitting on screen looking current.
 */
export const renewSubscription = (env, id) =>
  subscriptionRequest("PUT", `/renew/${encodeURIComponent(id)}`, env);

export const deleteSubscription = (env, id) =>
  subscriptionRequest("DELETE", `/${encodeURIComponent(id)}`, env);
