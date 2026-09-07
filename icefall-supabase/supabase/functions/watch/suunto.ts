// Suunto — Suunto Cloud API v2 (the Suunto App platform; Movescount closed
// to consumers 10 Jan 2022 and is not this adapter's target).
//
// gate: "vendor-approval-required" — Suunto only issues API access to
// partners who have signed its API agreement, and ICEFALL has not been
// through that. This file exists so the connection is ready the day that
// changes, not before.

import type { WatchActivity } from "./types.ts";
import { HttpError, type TokenSet, type WatchAdapter } from "./registry.ts";

const AUTHORIZE = "https://cloudapi-oauth.suunto.com/oauth/authorize";
const TOKEN = "https://cloudapi-oauth.suunto.com/oauth/token";
const DATA = "https://cloudapi.suunto.com";

function basicAuth(): string {
  const id = Deno.env.get("SUUNTO_CLIENT_ID");
  const secret = Deno.env.get("SUUNTO_CLIENT_SECRET");
  if (!id) throw new Error("Missing secret: SUUNTO_CLIENT_ID");
  if (!secret) throw new Error("Missing secret: SUUNTO_CLIENT_SECRET");
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

function subscriptionKey(): string {
  const v = Deno.env.get("SUUNTO_SUBSCRIPTION_KEY");
  if (!v) throw new Error("Missing secret: SUUNTO_SUBSCRIPTION_KEY");
  return v;
}

/** EVERY data request carries both headers — the FAQ is explicit that the
 *  subscription key is required "for Cloud API requests but not for OAuth
 *  related requests," so it belongs here and not on the auth calls. */
function dataHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    "ocp-apim-subscription-key": subscriptionKey(),
  };
}

/**
 * The Suunto JWT's `user` claim IS the identity — confirmed verbatim in
 * Suunto's own FAQ: "In the JWT token in the user field you will receive
 * Suunto user name, which you can use later to handle notification about new
 * user activities/workouts." Decoded WITHOUT verifying the signature, same
 * reasoning as COROS's id_token read: this only ever reads a token Suunto
 * itself just issued to ICEFALL over TLS.
 */
function usernameFromJwt(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { user?: unknown };
    return typeof payload.user === "string" ? payload.user : null;
  } catch {
    return null;
  }
}

interface SuuntoTokenResponse {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

function toTokenSet(t: SuuntoTokenResponse): TokenSet {
  const username = usernameFromJwt(t.access_token);
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    scope: t.scope ?? "",
    apiBase: DATA,
    providerUserId: username,
    // The username IS the human-readable identity Suunto gives us — there is
    // no separate "display name" field documented, so the same confirmed
    // value serves both roles rather than leaving accountLabel unfilled.
    accountLabel: username,
  };
}

interface SuuntoHrData {
  workoutAvgHR?: number;
  workoutMaxHR?: number;
}

interface SuuntoGear {
  name?: string;
}

interface SuuntoWorkout {
  workoutKey?: string;
  activityId?: number;
  startTime?: number; // epoch ms
  totalTime?: number; // seconds
  totalDistance?: number;
  totalAscent?: number;
  totalDescent?: number;
  hrdata?: SuuntoHrData;
  energyConsumption?: number;
  timeOffsetInMinutes?: number;
  gear?: SuuntoGear;
}

function mapWorkout(w: SuuntoWorkout): WatchActivity | null {
  if (!w.workoutKey || w.startTime === undefined) return null; // nothing to key it by
  return {
    providerActivityId: w.workoutKey,
    // Suunto App activity ids are numeric with no published name mapping
    // reachable outside APIzone; stored as the vendor's own string per the
    // "sport is the vendor's own string, never translated on the server" rule.
    sport: w.activityId !== undefined ? String(w.activityId) : "",
    name: null, // no title/name field is documented on a Suunto workout
    startedAt: new Date(w.startTime).toISOString(),
    utcOffsetMinutes: w.timeOffsetInMinutes ?? null,
    durationSec: w.totalTime ?? 0,
    movingSec: null, // Suunto gives one duration only
    distanceM: w.totalDistance ?? null,
    elevationGainM: w.totalAscent ?? null,
    elevationLossM: w.totalDescent ?? null,
    avgHeartRateBpm: w.hrdata?.workoutAvgHR ?? null,
    maxHeartRateBpm: w.hrdata?.workoutMaxHR ?? null,
    calories: w.energyConsumption ?? null,
    deviceName: w.gear?.name ?? null,
    vendorEntered: null, // Suunto does not say
  };
}

export const suunto: WatchAdapter = {
  provider: "suunto",
  gate: "vendor-approval-required",
  requiredSecrets: ["SUUNTO_CLIENT_ID", "SUUNTO_CLIENT_SECRET", "SUUNTO_SUBSCRIPTION_KEY"],
  maxWindowDays: 30,
  regional: false,

  apiBaseFor(): string {
    return DATA;
  },

  authorizeUrl(a: { redirectUri: string }): string {
    // No PKCE documented (almost certainly unsupported — the token endpoint
    // mandates Basic client-secret auth) and no `scope` parameter documented
    // on the authorize URL either. Sending only what Suunto's own
    // /how-to-start example sends.
    const id = Deno.env.get("SUUNTO_CLIENT_ID");
    if (!id) throw new Error("Missing secret: SUUNTO_CLIENT_ID");
    const url = new URL(AUTHORIZE);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", id);
    url.searchParams.set("redirect_uri", a.redirectUri);
    return url.toString();
  },

  async exchange(a: { code: string; redirectUri: string }): Promise<TokenSet> {
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { authorization: basicAuth(), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        redirect_uri: a.redirectUri,
        code: a.code,
      }),
    });
    if (!res.ok) throw new HttpError(res.status, "suunto_token_failed");
    return toTokenSet((await res.json()) as SuuntoTokenResponse);
  },

  async refresh(a: { refreshToken: string }): Promise<TokenSet> {
    // NOT CONFIRMED: no page reachable without an APIzone login documents the
    // refresh grant's exact shape. Assumed to mirror the standard
    // grant_type=refresh_token pattern with the same Basic client auth used
    // at token exchange — verify against the api-details page once inside
    // APIzone before relying on this in production.
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: { authorization: basicAuth(), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: a.refreshToken }),
    });
    if (!res.ok) throw new HttpError(res.status, "suunto_token_failed");
    return toTokenSet((await res.json()) as SuuntoTokenResponse);
  },

  identify(a: {
    accessToken: string;
  }): Promise<{ providerUserId: string | null; accountLabel: string | null; scope: string }> {
    const username = usernameFromJwt(a.accessToken);
    return Promise.resolve({ providerUserId: username, accountLabel: username, scope: "" });
  },

  async listActivities(a: {
    accessToken: string;
    apiBase: string;
    sinceIso: string;
    untilIso: string;
  }): Promise<WatchActivity[]> {
    /*
     * ⚠️ NO QUERY PARAMETERS. The since/until/limit/offset parameter names
     * for /v2/workouts are not publicly documented — confirmed absent from
     * every reachable Suunto page — so none are guessed here. This fetches
     * whatever the endpoint returns by default and filters the window
     * client-side. Read the real parameter names off the APIzone api-details
     * page (workout-api) once vendor approval is granted, and add them here
     * with the date they were read.
     */
    const res = await fetch(`${a.apiBase}/v2/workouts`, { headers: dataHeaders(a.accessToken) });

    if (res.status === 429) throw new HttpError(429, "rate_limited");
    if (!res.ok) throw new HttpError(502, "vendor_unreachable");

    const body = (await res.json().catch(() => null)) as unknown;
    // The list envelope for /v2/workouts is not documented either; accepted
    // defensively as a bare array or an object carrying one.
    const workouts: SuuntoWorkout[] = Array.isArray(body)
      ? (body as SuuntoWorkout[])
      : Array.isArray((body as { data?: unknown })?.data)
        ? (body as { data: SuuntoWorkout[] }).data
        : [];

    const sinceMs = Date.parse(a.sinceIso);
    const untilMs = Date.parse(a.untilIso);
    const out: WatchActivity[] = [];
    for (const w of workouts) {
      if (w.startTime === undefined || w.startTime < sinceMs || w.startTime >= untilMs) continue;
      const mapped = mapWorkout(w);
      if (mapped) out.push(mapped);
    }
    return out;
  },

  revoke(): Promise<boolean> {
    // Suunto's deauthorize path is not publicly documented. Do not guess an
    // endpoint — report false and let the client send the person to Suunto's
    // own account settings, per the contract.
    return Promise.resolve(false);
  },

  canImport(scope: string): boolean {
    return scope.includes("workout");
  },
};
