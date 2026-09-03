/**
 * Oura Ring — the store. Everything that talks to Supabase, and nothing else.
 *
 * ── WHY THIS DOES NOT USE THE PUBLISHABLE KEY, AND DOES NOT USE service_role ─
 *
 * `_waitlist.mjs` sets the house doctrine and states its reason plainly: anon
 * key, insert-only, no SELECT policy, "deliberately not the service-role key",
 * because a leaked environment should buy an attacker as little as possible.
 *
 * Neither of those two keys works here, and it is worth being exact about why
 * before reaching for the easy one.
 *
 *   THE PUBLISHABLE KEY CANNOT BE USED. It is public — it ships inside the
 *   phone app's bundle. Any RPC granted to `anon` is granted to everybody on
 *   the internet. A function that hands back a person's Oura tokens, or writes
 *   a heart rate onto their record, cannot be granted to `anon` at any price.
 *
 *   THE SERVICE-ROLE KEY WOULD WORK AND COSTS TOO MUCH. It is every table in
 *   the project, RLS off. This function needs six tables. Trading the whole
 *   database for six tables is the exact trade the waitlist refused.
 *
 * ── WHAT IS USED INSTEAD ────────────────────────────────────────────────────
 *
 * A short-lived JWT this server signs with the project's JWT secret, carrying
 * `role: "oura_service"` — a database role created by the migration with
 * EXECUTE on the Oura functions and nothing else. PostgREST assumes that role
 * for the request. So an attacker holding this environment holds the Oura
 * tables; they do not hold `waitlist`, `enquiries`, `profiles` or anything else.
 *
 * The JWT lives 60 seconds and is minted per request. There is no long-lived
 * credential to steal from a log.
 *
 * ── AND THE TOKENS ARE ENCRYPTED ON TOP OF THAT ─────────────────────────────
 *
 * Health rows are stored as ordinary columns; the OAuth tokens are not. The
 * difference is that a stolen health row is a snapshot of the past, while a
 * stolen refresh token is a live subscription to everything the person's ring
 * measures from now on. So tokens are sealed with AES-256-GCM under
 * OURA_TOKEN_KEY, which lives in this environment and never in the database.
 * Whoever reads the table without that key reads ciphertext.
 *
 * This is NOT a claim that the health rows are protected by encryption. They
 * are not. `OURA_SERVICE` access is access to this person's sleep and heart
 * rate, and that environment must be treated as a health-data credential.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/* -- configuration --------------------------------------------------------- */

/** Reads config at call time, not module load — serverless envs land late. */
export function storeConfig(env = {}) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const key =
    env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || "";
  const jwtSecret = env.SUPABASE_JWT_SECRET || "";
  const tokenKey = env.OURA_TOKEN_KEY || "";
  if (!url || !key) return null;
  return { url, key, jwtSecret, tokenKey };
}

/**
 * Whether the write side is usable. Read-only paths (`summary`) need less —
 * they run entirely on the caller's own JWT — so they check `storeConfig`
 * alone and this function is about the elevated half.
 */
export function storeWritable(env = {}) {
  const cfg = storeConfig(env);
  return Boolean(cfg && cfg.jwtSecret && tokenKeyBytes(cfg.tokenKey));
}

/* -- token sealing --------------------------------------------------------- */

function tokenKeyBytes(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Accept hex or base64; reject anything that is not exactly 32 bytes rather
  // than padding or truncating it into something that would silently work.
  let buf = null;
  if (/^[0-9a-fA-F]{64}$/.test(s)) buf = Buffer.from(s, "hex");
  else {
    try {
      const b = Buffer.from(s, "base64");
      if (b.length === 32) buf = b;
    } catch {
      /* not base64 — falls through to null */
    }
  }
  return buf && buf.length === 32 ? buf : null;
}

/** @returns {string} `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function sealToken(plaintext, env) {
  const key = tokenKeyBytes(storeConfig(env)?.tokenKey);
  if (!key) throw new Error("OURA_TOKEN_KEY is missing or not 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

/** @returns {string | null} — null means it did not decrypt, which is a failure, not an empty token. */
export function openToken(sealed, env) {
  const key = tokenKeyBytes(storeConfig(env)?.tokenKey);
  if (!key || typeof sealed !== "string") return null;
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[3], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Wrong key, or a tampered row. Either way this is not a token.
    return null;
  }
}

/* -- the oura_service identity --------------------------------------------- */

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

/**
 * A 60-second HS256 JWT naming the `oura_service` role.
 *
 * Supabase's own tokens are signed with this secret, which is why the role in
 * the payload is honoured. The migration must both create the role and
 * `grant oura_service to authenticator`, or PostgREST cannot assume it and
 * every call here returns a role-does-not-exist error rather than a wrong
 * answer — a loud failure, which is the one to prefer.
 */
function serviceJwt(cfg, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ role: "oura_service", iss: "icefall-web", iat, exp: iat + 60 });
  const body = `${header}.${payload}`;
  const sig = createHmac("sha256", cfg.jwtSecret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * One RPC as `oura_service`.
 *
 * @returns {Promise<{ok: true, data: any} | {ok: false, status: number, detail: string}>}
 * Failures are returned, not thrown, because every caller here has to decide
 * what a screen shows when the store is unreachable, and an exception is the
 * shape that gets caught once at the top and turned into a shrug.
 */
export async function serviceRpc(fn, args, env = {}) {
  const cfg = storeConfig(env);
  if (!cfg) return { ok: false, status: 0, detail: "supabase not configured" };
  if (!cfg.jwtSecret) return { ok: false, status: 0, detail: "SUPABASE_JWT_SECRET not set" };

  let res;
  try {
    res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${serviceJwt(cfg)}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(args || {}),
    });
  } catch (e) {
    return { ok: false, status: 0, detail: String(e?.message || e) };
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, status: res.status, detail: text.slice(0, 400) };
  try {
    return { ok: true, data: text ? JSON.parse(text) : null };
  } catch {
    return { ok: true, data: null };
  }
}

/* -- the caller's own identity --------------------------------------------- */

/**
 * Who is asking, according to Supabase.
 *
 * The bearer is verified BY SUPABASE rather than by us: no JWT secret, no
 * signature checking, no key rotation to get wrong. It costs one round trip on
 * each authenticated call, which is the price of not writing a second, subtly
 * different verifier next to Supabase's.
 *
 * @returns {Promise<{id: string} | null>}
 */
export async function userFromBearer(bearer, env = {}) {
  const cfg = storeConfig(env);
  if (!cfg || typeof bearer !== "string" || bearer.length < 20) return null;
  try {
    const res = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.key, Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    return json?.id ? { id: String(json.id) } : null;
  } catch {
    return null;
  }
}

/**
 * One RPC AS THE CALLER, with their own token.
 *
 * The read path uses this and never `serviceRpc`, so a person can only ever be
 * shown their own rows — enforced by `auth.uid()` inside the function rather
 * than by a `where` clause this file could get wrong.
 */
export async function userRpc(fn, args, bearer, env = {}) {
  const cfg = storeConfig(env);
  if (!cfg) return { ok: false, status: 0, detail: "supabase not configured" };
  let res;
  try {
    res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(args || {}),
    });
  } catch (e) {
    return { ok: false, status: 0, detail: String(e?.message || e) };
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, status: res.status, detail: text.slice(0, 400) };
  try {
    return { ok: true, data: text ? JSON.parse(text) : null };
  } catch {
    return { ok: true, data: null };
  }
}

/* -- consent --------------------------------------------------------------- */

/**
 * Has this person granted the `health-metrics` purpose, and is that grant still
 * the latest decision?
 *
 * Asked BEFORE the authorize redirect, not after the callback. Consent that is
 * checked only on the way back is consent checked after the data has already
 * started moving.
 *
 * @returns {Promise<{granted: boolean, reason: string}>}
 */
export async function consentGranted(userId, env = {}) {
  const r = await serviceRpc("oura_consent_state", { p_user: userId }, env);
  if (!r.ok) return { granted: false, reason: "store-unreachable" };
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  if (!row || row.decision == null) return { granted: false, reason: "never-asked" };
  if (row.decision === "granted") return { granted: true, reason: "granted" };
  return { granted: false, reason: row.decision === "withdrawn" ? "withdrawn" : "declined" };
}

/* -- connections ----------------------------------------------------------- */

const one = (r) => (Array.isArray(r) ? r[0] || null : r || null);

export async function connectionForUser(userId, env) {
  const r = await serviceRpc("oura_connection_by_user", { p_user: userId }, env);
  return r.ok ? { ok: true, connection: one(r.data) } : r;
}

export async function connectionForOuraUser(ouraUserId, env) {
  const r = await serviceRpc("oura_connection_by_oura_user", { p_oura_user: ouraUserId }, env);
  return r.ok ? { ok: true, connection: one(r.data) } : r;
}

/** Writes the pair from a first authorization. Tokens are sealed here, never above. */
export function saveNewConnection({ userId, ouraUserId, tokens, scope }, env) {
  return serviceRpc(
    "oura_connect",
    {
      p_user: userId,
      p_oura_user: ouraUserId,
      p_access: sealToken(tokens.accessToken, env),
      p_refresh: tokens.refreshToken ? sealToken(tokens.refreshToken, env) : null,
      p_expires_at: tokens.expiresAt,
      p_scope: scope || tokens.scope || "",
    },
    env,
  );
}

/**
 * Claim the right to refresh this connection.
 *
 * ONE PROCESS AT A TIME, ENFORCED IN THE DATABASE. A refresh token is single
 * use: two instances refreshing the same connection at the same moment means
 * one of them gets a token that is already dead, and — worse — the LIVE token
 * belongs to whichever write landed second. An in-process mutex cannot see the
 * other instance, so the lock is a conditional UPDATE in Postgres.
 *
 * @returns {Promise<{ok: boolean, claimed: boolean}>}
 */
export async function claimRefresh(connectionId, env, seconds = 30) {
  const r = await serviceRpc(
    "oura_claim_refresh",
    { p_connection: connectionId, p_seconds: seconds },
    env,
  );
  if (!r.ok) return { ok: false, claimed: false, detail: r.detail };
  const row = one(r.data);
  return { ok: true, claimed: row === true || row?.claimed === true };
}

/** Stores a rotated pair and clears the in-flight mark, in one statement. */
export function storeRotatedTokens(connectionId, tokens, env) {
  return serviceRpc(
    "oura_store_tokens",
    {
      p_connection: connectionId,
      p_access: sealToken(tokens.accessToken, env),
      p_refresh: tokens.refreshToken ? sealToken(tokens.refreshToken, env) : null,
      p_expires_at: tokens.expiresAt,
    },
    env,
  );
}

/**
 * Move a connection to a non-working state, with the reason recorded verbatim.
 *
 * States, and what each one means to a screen:
 *   active              usable
 *   reauthorise         the grant is gone; the person reconnects
 *   membership-lapsed   Oura says the subscription ended; ICEFALL cannot fix it
 *   rotation-lost       a refresh was issued and we never stored it — see below
 *   consent-withdrawn   they withdrew; the rows are already deleted
 */
export function markConnectionState(connectionId, state, detail, env) {
  return serviceRpc(
    "oura_mark_state",
    { p_connection: connectionId, p_state: state, p_detail: String(detail || "").slice(0, 500) },
    env,
  );
}

/* -- health rows ----------------------------------------------------------- */

/**
 * Idempotent write of one day of one collection.
 *
 * THE MONOTONIC GUARD IS THE POINT. Two webhooks for the same day are normal —
 * Oura sends `create` then `update` as a night is re-scored, and it retries on
 * any non-2xx for about an hour. The function refuses a write whose
 * `source_event_at` is older than the one already stored, so a retry that
 * overtakes a newer delivery cannot roll the row backwards.
 */
export function upsertDay({ userId, day, kind, payload, sourceEventAt, ouraObjectId }, env) {
  return serviceRpc(
    "oura_upsert_day",
    {
      p_user: userId,
      p_day: day,
      p_kind: kind,
      p_payload: payload,
      p_source_event_at: sourceEventAt || new Date().toISOString(),
      p_object_id: ouraObjectId || null,
    },
    env,
  );
}

/**
 * Record that a webhook arrived, and say whether it still needs doing.
 *
 * `fresh: false` means this exact delivery has already been PROCESSED, not
 * merely seen. The distinction is the whole value of the function: Oura retries
 * on any non-2xx, so an event we recorded and then failed to act on must come
 * back as fresh on the retry. Deduplicating on arrival instead would turn every
 * transient failure into permanently missing data.
 *
 * @returns {Promise<{ok: boolean, fresh: boolean, eventId: number|null}>}
 */
export async function recordWebhookEvent(event, env) {
  const r = await serviceRpc(
    "oura_record_event",
    {
      p_oura_user: event.user_id,
      p_data_type: event.data_type,
      p_event_type: event.event_type,
      p_object_id: event.object_id,
      p_event_time: event.event_time,
    },
    env,
  );
  if (!r.ok) return { ok: false, fresh: false, eventId: null, detail: r.detail };
  const row = one(r.data);
  return {
    ok: true,
    fresh: row?.fresh === true,
    eventId: row?.event_id ?? null,
  };
}

/* -- erasure --------------------------------------------------------------- */

/**
 * Delete everything ICEFALL holds about this person's ring.
 *
 * Deletes, not disables. A disconnect that only revokes a token leaves a sleep
 * and heart-rate history in the database that the person believes they removed.
 *
 * @returns {Promise<{ok: boolean, deleted: object}>} the per-table counts, which
 * are reported back to the person rather than summarised as "done".
 */
export async function deleteEverything(userId, reason, env) {
  const r = await serviceRpc(
    "oura_delete_all",
    { p_user: userId, p_reason: String(reason || "user-disconnect").slice(0, 100) },
    env,
  );
  if (!r.ok) return { ok: false, deleted: null, detail: r.detail };
  return { ok: true, deleted: one(r.data) || {} };
}

/**
 * Retention. Called opportunistically from the write paths, bounded so it can
 * never dominate a request.
 *
 * OPPORTUNISTIC IS NOT SCHEDULED. If nobody's ring syncs for a week, nothing
 * expires that week. This is a floor, not the retention guarantee, and the
 * scheduled call that would make it a guarantee is not built — see the note in
 * the migration.
 */
export function pruneExpired(env, limit = 500) {
  return serviceRpc("oura_prune_expired", { p_limit: limit }, env);
}
