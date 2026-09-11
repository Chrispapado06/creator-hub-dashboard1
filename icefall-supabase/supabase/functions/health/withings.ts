// Withings — sleep, body composition, blood pressure.
//
// ════════════════════════════════════════════════════════════════════════════
// THE OBLIGATION, AND WHERE IT IS MET
// ════════════════════════════════════════════════════════════════════════════
//
// From Withings' API terms of use (ICEFALL-INTEGRATIONS.md §1A):
//
//   "Must only query in response to user actions — use their webhooks, don't
//    poll."
//
// MET STRUCTURALLY, in three places, and the third is the one that matters:
//
//   1. `afterConnect()` below registers the webhook subscriptions the moment a
//      connection is made. Without them Withings never tells ICEFALL anything
//      and the connection is inert — so the subscription is part of connecting,
//      not an optional extra somebody remembers later.
//
//   2. `index.ts` exposes `POST /health/withings/webhook` for Withings to call.
//      That route is the ONLY way Withings data enters ICEFALL.
//
//   3. THERE IS NO POLLING CODE ANYWHERE, AND NO SCHEDULE THAT COULD CALL ONE.
//      No cron, no `setInterval`, no "check for new readings" button on the
//      Withings card. A negative duty is met by an absence, so the absence is
//      written down here: if a future change adds a timer that fetches
//      Withings, it breaks this term, whatever else it improves.
//
// ════════════════════════════════════════════════════════════════════════════
// WITHINGS DOES NOT USE HTTP STATUS CODES
// ════════════════════════════════════════════════════════════════════════════
//
// Every Withings response is HTTP 200 with a `status` field in the body: 0 is
// success and anything else is a failure. `res.ok` is therefore meaningless
// here and checking it is the classic way to read an error as a token. Every
// call below goes through `withingsPost`, which checks the body.

import { HttpError, type TokenSet, type HealthAdapter } from "./registry.ts";

const AUTHORIZE = "https://account.withings.com/oauth2_user/authorize2";
const API = "https://wbsapi.withings.net";
const TOKEN_PATH = "/v2/oauth2";
const NOTIFY_PATH = "/notify";

/**
 * What ICEFALL asks for — and what it deliberately does not.
 *
 * `user.info` carries the account identity so a card can say which Withings
 * account it is. `user.metrics` is weight, body composition and blood
 * pressure. `user.activity` is activity and workouts. `user.sleepevents` is
 * the sleep summary with its stages and overnight HRV.
 *
 * ECG IS NOT REQUESTED. Withings exposes it and a scope exists for it; a
 * single-lead cardiogram is diagnostic-grade data that ICEFALL has no screen
 * for and no clinical business holding. "Store the minimum" is the house rule,
 * and the minimum here excludes it. Nothing in the app claims ECG as a result.
 */
const SCOPES = ["user.info", "user.metrics", "user.activity", "user.sleepevents"];

/**
 * The notification categories subscribed at connect time.
 *
 * One subscription per `appli` — Withings has no "everything" value, so a
 * category left out here is a category ICEFALL is never told about. This list
 * matches the scopes above and the words on the settings screen exactly; if
 * one of the three changes, all three change.
 */
const APPLI_SUBSCRIPTIONS: readonly { appli: number; what: string }[] = [
  { appli: 1, what: "weight and body composition" },
  { appli: 4, what: "heart rate and blood pressure" },
  { appli: 16, what: "activity and workouts" },
  { appli: 44, what: "sleep summaries" },
];

function clientId(): string {
  const id = Deno.env.get("WITHINGS_CLIENT_ID");
  if (!id) throw new Error("Missing secret: WITHINGS_CLIENT_ID");
  return id;
}

function clientSecret(): string {
  const s = Deno.env.get("WITHINGS_CLIENT_SECRET");
  if (!s) throw new Error("Missing secret: WITHINGS_CLIENT_SECRET");
  return s;
}

interface WithingsEnvelope<T> {
  status: number;
  body?: T;
  error?: string;
}

/** One POST, one envelope check. `status !== 0` is the failure, not `!res.ok`. */
async function withingsPost<T>(path: string, form: URLSearchParams): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form,
  });
  if (!res.ok) throw new HttpError(res.status, "withings_unreachable");
  const env = (await res.json().catch(() => null)) as WithingsEnvelope<T> | null;
  if (!env || env.status !== 0) {
    /* 401 is Withings' "invalid or expired token" status, and `index.ts` maps
       a 401 from a refresh onto "the person revoked us" — so it must not be
       flattened into a generic failure here. */
    const status = env?.status === 401 ? 401 : 502;
    throw new HttpError(status, `withings_status_${env?.status ?? "none"}`);
  }
  return env.body as T;
}

interface WithingsTokenBody {
  userid?: number | string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

function toTokenSet(t: WithingsTokenBody): TokenSet {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    scope: t.scope ?? SCOPES.join(","),
    apiBase: API,
    // `userid` is the key every webhook notification arrives keyed by — without
    // it a notification cannot be matched to an ICEFALL account at all.
    providerUserId: t.userid !== undefined ? String(t.userid) : null,
    accountLabel: null,
  };
}

/* -------------------------------------------------------------------------- */
/* The signature scheme                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Withings signs its administrative actions — `revoke` among them — with an
 * HMAC-SHA256 of the comma-joined action, client id and nonce, keyed by the
 * client secret. The nonce itself is fetched with the same scheme over a
 * timestamp.
 *
 * THIS IS THE ONE PLACE THE CLIENT SECRET IS USED FOR SOMETHING OTHER THAN A
 * TOKEN EXCHANGE, and it is still server-side only. A browser performing this
 * would be a browser holding the secret.
 */
async function sign(parts: string[]): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(parts.join(",")));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function nonce(): Promise<string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = await withingsPost<{ nonce: string }>(
    "/v2/signature",
    new URLSearchParams({
      action: "getnonce",
      client_id: clientId(),
      timestamp,
      signature: await sign(["getnonce", clientId(), timestamp]),
    }),
  );
  return body.nonce;
}

/* -------------------------------------------------------------------------- */

export const withings: HealthAdapter = {
  provider: "withings",
  gate: "none",
  gateReason: "",
  requiredSecrets: ["WITHINGS_CLIENT_ID", "WITHINGS_CLIENT_SECRET"],
  scopes: SCOPES,

  authorizeUrl(a: { state: string; redirectUri: string }): string {
    const url = new URL(AUTHORIZE);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId());
    url.searchParams.set("state", a.state);
    // Comma-separated for Withings, not space-separated. A space-joined list
    // is silently accepted as one unknown scope and the grant comes back empty.
    url.searchParams.set("scope", SCOPES.join(","));
    url.searchParams.set("redirect_uri", a.redirectUri);
    return url.toString();
  },

  async exchange(a: { code: string; redirectUri: string }): Promise<TokenSet> {
    const body = await withingsPost<WithingsTokenBody>(
      TOKEN_PATH,
      new URLSearchParams({
        action: "requesttoken",
        grant_type: "authorization_code",
        client_id: clientId(),
        client_secret: clientSecret(),
        code: a.code,
        redirect_uri: a.redirectUri,
      }),
    );
    return toTokenSet(body);
  },

  async refresh(a: { refreshToken: string }): Promise<TokenSet> {
    const body = await withingsPost<WithingsTokenBody>(
      TOKEN_PATH,
      new URLSearchParams({
        action: "requesttoken",
        grant_type: "refresh_token",
        client_id: clientId(),
        client_secret: clientSecret(),
        refresh_token: a.refreshToken,
      }),
    );
    return toTokenSet(body);
  },

  identify(): Promise<{ providerUserId: string | null; accountLabel: string | null }> {
    /*
     * `userid` already arrives on the token response — the identity that
     * matters, because it is what webhooks are keyed by.
     *
     * A DISPLAY NAME IS NOT FETCHED. `user.info` would carry one, but reading
     * a person's name to decorate a card is data ICEFALL does not need and
     * would then be holding. The card says "Withings did not say which account
     * this is" instead, which is true and costs nobody anything.
     */
    return Promise.resolve({ providerUserId: null, accountLabel: null });
  },

  async revoke(a: { providerUserId: string | null }): Promise<boolean> {
    /*
     * Withings is the only one of the four whose revocation needs the signed
     * scheme above. A failure at any step answers false and the app tells the
     * person to remove ICEFALL in the Withings app — never a claimed
     * revocation.
     */
    if (!a.providerUserId) return false;
    try {
      const n = await nonce();
      await withingsPost<unknown>(
        TOKEN_PATH,
        new URLSearchParams({
          action: "revoke",
          client_id: clientId(),
          nonce: n,
          signature: await sign(["revoke", clientId(), n]),
          userid: a.providerUserId,
        }),
      );
      return true;
    } catch {
      return false;
    }
  },

  async afterConnect(a: {
    accessToken: string;
    callbackUrl: string;
  }): Promise<{ ok: boolean; detail: string }> {
    /*
     * ═══════════════════════════════════════════════════════════════════════
     * "Must only query in response to user actions — use their webhooks,
     *  don't poll."
     * ═══════════════════════════════════════════════════════════════════════
     *
     * This is the line that discharges it. Every category ICEFALL wants is
     * subscribed here, at connect time, because a Withings connection with no
     * subscription is not a slow connection — it is a connection that will
     * never deliver anything, and the only way to get data out of it would be
     * the polling the terms forbid.
     *
     * A PARTIAL RESULT IS REPORTED, NOT SWALLOWED. Withings registers one
     * category at a time and any of them can fail on its own; the connection
     * still stands (the grant exists, it is the app's to keep), and the screen
     * is told which categories are live rather than being left to imply all of
     * them are.
     */
    const failed: string[] = [];
    for (const sub of APPLI_SUBSCRIPTIONS) {
      try {
        await withingsPost<unknown>(
          NOTIFY_PATH,
          new URLSearchParams({
            action: "subscribe",
            access_token: a.accessToken,
            callbackurl: a.callbackUrl,
            appli: String(sub.appli),
            comment: "ICEFALL",
          }),
        );
      } catch {
        failed.push(sub.what);
      }
    }
    if (failed.length === 0) {
      return { ok: true, detail: "subscribed" };
    }
    return { ok: false, detail: failed.join("; ") };
  },
};

export const WITHINGS_SUBSCRIPTIONS = APPLI_SUBSCRIPTIONS;
