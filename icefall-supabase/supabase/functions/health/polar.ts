// Polar — AccessLink, the DAILY PHYSIOLOGY half.
//
// ════════════════════════════════════════════════════════════════════════════
// THE OBLIGATIONS, AND WHERE EACH ONE IS MET
// ════════════════════════════════════════════════════════════════════════════
//
// Polar's API agreement carries three duties (ICEFALL-INTEGRATIONS.md §1A):
//
//   1. "Must show a text credit 'Source: Polar' wherever Polar data appears"
//      → MET IN THE APP, not here: `icefall-app/src/health/PolarCredit.tsx`,
//        rendered at every surface that draws Polar-sourced data. A server
//        cannot discharge a display duty; this comment exists so the two
//        halves stay tied together.
//
//   2. "no Polar logo without written consent"
//      → MET by there being no Polar mark anywhere in the codebase. The
//        neutral tile in `WatchTile.tsx` was drawn for exactly this reason and
//        the health cards reuse it. Do not add one.
//
//   3. "must delete the token when a user disconnects"
//      → MET in `index.ts`'s `disconnect()`, at the row delete, where the
//        obligation is quoted again beside the line that discharges it.
//        Polar publishes no revocation endpoint this file could call, so
//        `revoke()` below returns false and the app says so rather than
//        claiming a revocation it did not perform.
//
// ════════════════════════════════════════════════════════════════════════════
// ONE GRANT, TWO CARDS — a collision worth knowing about
// ════════════════════════════════════════════════════════════════════════════
//
// `watch/polar.ts` already holds a Polar grant for `training_sessions:read`
// (the outings). This adapter asks for the daily physiology as well. Polar
// issues ONE grant per app per user, so a person who connects both cards
// authorises the same ICEFALL client twice.
//
// WHETHER THE SECOND AUTHORIZATION INVALIDATES THE FIRST TOKEN IS NOT STATED
// in any Polar page this was written against. Two things follow, and both are
// deliberate:
//   • the scope list below is a SUPERSET — it includes the watch scope — so a
//     health grant is never narrower than a watch grant it may replace;
//   • the connections screen says plainly that reconnecting one Polar card may
//     require reconnecting the other, rather than presenting two cards as if
//     they were two independent accounts.
//
// ════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════
//
// Taken verbatim from `watch/polar.ts` — the same OAuth server, already
// reviewed once. Nothing new is invented here; the only thing that differs
// between the two adapters is the scope string.

import { HttpError, type TokenSet, type HealthAdapter } from "./registry.ts";

const AUTHORIZE = "https://auth.polar.com/oauth/authorize";
const TOKEN = "https://auth.polar.com/oauth/token";
const DATA = "https://www.polaraccesslink.com/v4/data";

/**
 * What ICEFALL asks Polar for.
 *
 * ⚠️ THE DAILY SCOPE STRINGS ARE NOT CONFIRMED. `training_sessions:read` is —
 * it is the one `watch/polar.ts` already runs on. The other four are the
 * shapes Polar's v4 scope names take, written here so the intent is legible,
 * and they MUST be checked against the scope list on admin.polaraccesslink.com
 * the day the client is registered. That is a five-minute job with the console
 * open and an impossible one without it.
 *
 * POLAR_HEALTH_SCOPES overrides the whole list, space-separated, so correcting
 * them is a secret change rather than a deploy. If Polar's console shows
 * different names, set that variable and leave this line alone as the record
 * of what was asked for and why.
 */
const DEFAULT_SCOPES = [
  "training_sessions:read", // the superset half — see the collision note above
  "sleep:read", // sleep and sleep stages
  "recharge:read", // Nightly Recharge (recovery), ANS charge
  "continuous_heart_rate:read", // 24/7 heart rate
  "daily_activity:read", // steps, activity
];

function scopes(): string[] {
  const override = Deno.env.get("POLAR_HEALTH_SCOPES");
  if (!override) return DEFAULT_SCOPES;
  return override.split(/\s+/).filter(Boolean);
}

function basicAuth(): string {
  const id = Deno.env.get("POLAR_CLIENT_ID");
  const secret = Deno.env.get("POLAR_CLIENT_SECRET");
  if (!id) throw new Error("Missing secret: POLAR_CLIENT_ID");
  if (!secret) throw new Error("Missing secret: POLAR_CLIENT_SECRET");
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

interface PolarTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  x_user_id?: number | string;
}

function toTokenSet(t: PolarTokenResponse): TokenSet {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    scope: t.scope ?? scopes().join(" "),
    apiBase: DATA,
    // Polar's join key — the one identity field its token response carries.
    providerUserId: t.x_user_id !== undefined ? String(t.x_user_id) : null,
    accountLabel: null, // Polar's token response carries no display name
  };
}

export const polar: HealthAdapter = {
  provider: "polar",
  gate: "none",
  gateReason: "",
  requiredSecrets: ["POLAR_CLIENT_ID", "POLAR_CLIENT_SECRET"],
  get scopes() {
    return scopes();
  },

  authorizeUrl(a: { state: string; redirectUri: string }): string {
    // NO PKCE — Polar's token endpoint mandates client-secret Basic auth,
    // which is the non-PKCE pattern, and no Polar page documents
    // code_challenge. The verifier is still minted upstream and simply unused,
    // exactly as `watch/polar.ts` records.
    const id = Deno.env.get("POLAR_CLIENT_ID");
    if (!id) throw new Error("Missing secret: POLAR_CLIENT_ID");
    const url = new URL(AUTHORIZE);
    url.searchParams.set("client_id", id);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes().join(" "));
    url.searchParams.set("redirect_uri", a.redirectUri);
    url.searchParams.set("state", a.state);
    return url.toString();
  },

  async exchange(a: { code: string }): Promise<TokenSet> {
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: {
        authorization: basicAuth(),
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json;charset=UTF-8",
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code: a.code }),
    });
    if (!res.ok) throw new HttpError(res.status, "polar_token_failed");
    return toTokenSet((await res.json()) as PolarTokenResponse);
  },

  async refresh(a: { refreshToken: string }): Promise<TokenSet> {
    const res = await fetch(TOKEN, {
      method: "POST",
      headers: {
        authorization: basicAuth(),
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json;charset=UTF-8",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: a.refreshToken }),
    });
    if (!res.ok) throw new HttpError(res.status, "polar_token_failed");
    return toTokenSet((await res.json()) as PolarTokenResponse);
  },

  identify(): Promise<{ providerUserId: string | null; accountLabel: string | null }> {
    // x_user_id already arrives on the token response. Nothing else is
    // confirmed to call — this adapter never requests a profile scope — so
    // nulls rather than a guess.
    return Promise.resolve({ providerUserId: null, accountLabel: null });
  },

  revoke(): Promise<boolean> {
    /*
     * NO REVOCATION ENDPOINT IS PUBLISHED for AccessLink, which
     * `watch/polar.ts` established first and nothing since has changed.
     *
     * The obligation Polar actually states is about the TOKEN, and it is met:
     *
     *     "must delete the token when a user disconnects"
     *
     * — discharged by the row delete in `index.ts`. Returning false here is
     * what makes the app say "ICEFALL has forgotten this; remove ICEFALL in
     * your Polar account to be certain" instead of implying Polar was told.
     */
    return Promise.resolve(false);
  },
};
