// Polar — AccessLink API v4 ONLY.
//
// v4, not v3: v3 has no elevation-gain field at all (the mountaineering
// number ICEFALL needs most), and its transaction-based exercise fetch is
// Polar's own docs' "Exercises (deprecated)" section. v4 is date-range JSON,
// no transaction dance, no user-registration step.

import type { WatchActivity } from "./types.ts";
import { HttpError, type TokenSet, type WatchAdapter } from "./registry.ts";

const AUTHORIZE = "https://auth.polar.com/oauth/authorize";
const TOKEN = "https://auth.polar.com/oauth/token";
const DATA = "https://www.polaraccesslink.com/v4/data";

/** The one v4 scope ICEFALL asks for. Requesting `profile:read` or any of
 *  the others would be asking for a permission this feature does not use. */
const SCOPE = "training_sessions:read";

function basicAuth(): string {
  const id = Deno.env.get("POLAR_CLIENT_ID");
  const secret = Deno.env.get("POLAR_CLIENT_SECRET");
  if (!id) throw new Error("Missing secret: POLAR_CLIENT_ID");
  if (!secret) throw new Error("Missing secret: POLAR_CLIENT_SECRET");
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

interface PolarTokenResponse {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  x_user_id?: number | string;
}

function toTokenSet(t: PolarTokenResponse): TokenSet {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null, // v3 issues none; v4 does
    expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    scope: t.scope ?? SCOPE,
    apiBase: DATA,
    // Polar's join key — see the migration's own comment on provider_user_id.
    providerUserId: t.x_user_id !== undefined ? String(t.x_user_id) : null,
    accountLabel: null, // Polar's token response carries no display name
  };
}

interface PolarExercise {
  ascentMeters?: number;
  descentMeters?: number;
}

interface PolarSession {
  identifier?: { id?: string };
  name?: string | null;
  startTime?: string;
  durationMillis?: number;
  distanceMeters?: number;
  calories?: number;
  hrAvg?: number;
  hrMax?: number;
  timezoneOffsetMinutes?: number;
  product?: { modelName?: string };
  sport?: { id?: string };
  exercises?: PolarExercise[];
}

function mapSession(s: PolarSession): WatchActivity | null {
  const providerActivityId = s.identifier?.id;
  const startedAt = s.startTime;
  if (!providerActivityId || !startedAt) return null; // nothing to key it by
  const exercise = s.exercises?.[0];
  return {
    providerActivityId,
    sport: s.sport?.id ?? "",
    name: s.name ?? null,
    startedAt,
    utcOffsetMinutes: s.timezoneOffsetMinutes ?? null,
    durationSec: s.durationMillis !== undefined ? Math.round(s.durationMillis / 1000) : 0,
    movingSec: null, // Polar gives one duration only
    distanceM: s.distanceMeters ?? null,
    elevationGainM: exercise?.ascentMeters ?? null,
    elevationLossM: exercise?.descentMeters ?? null,
    avgHeartRateBpm: s.hrAvg ?? null,
    maxHeartRateBpm: s.hrMax ?? null,
    calories: s.calories ?? null,
    deviceName: s.product?.modelName ?? null,
    vendorEntered: null, // Polar does not say
  };
}

export const polar: WatchAdapter = {
  provider: "polar",
  gate: "none",
  requiredSecrets: ["POLAR_CLIENT_ID", "POLAR_CLIENT_SECRET"],
  maxWindowDays: 90,
  regional: false,

  apiBaseFor(): string {
    return DATA;
  },

  authorizeUrl(a: { state: string; redirectUri: string }): string {
    // NO PKCE for Polar — no v3 or v4 page documents code_challenge/
    // code_verifier, and the token endpoint mandates client-secret Basic
    // auth, which is the non-PKCE pattern. The challenge is still minted and
    // stored upstream (nullable column), simply unused here.
    const id = Deno.env.get("POLAR_CLIENT_ID");
    if (!id) throw new Error("Missing secret: POLAR_CLIENT_ID");
    const url = new URL(AUTHORIZE);
    url.searchParams.set("client_id", id);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPE);
    // ALWAYS sent: v4's authorize endpoint ignores the admin page's "default
    // URL" setting, per Polar's own docs.
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
      // No redirect_uri here — Polar's documented token body for both
      // generations is just grant_type + code.
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

  identify(): Promise<{
    providerUserId: string | null;
    accountLabel: string | null;
    scope: string;
  }> {
    // x_user_id already arrives on the token response inside `exchange()` —
    // the one confirmed identity field. Nothing else is confirmed to call
    // (this adapter never requests `profile:read`), so nulls here rather
    // than a guess.
    return Promise.resolve({ providerUserId: null, accountLabel: null, scope: "" });
  },

  async listActivities(a: {
    accessToken: string;
    apiBase: string;
    sinceIso: string;
    untilIso: string;
  }): Promise<WatchActivity[]> {
    const url = new URL(`${a.apiBase}/training-sessions/list`);
    url.searchParams.set("from", a.sinceIso);
    url.searchParams.set("to", a.untilIso);
    // ⚠️ NO `features` PARAMETER. Adding one collapses the query window from
    // 90 days to ONE DAY (Polar's own documented behaviour) — omit it always.

    const res = await fetch(url, {
      headers: { authorization: `Bearer ${a.accessToken}`, accept: "application/json" },
    });

    if (res.status === 429) throw new HttpError(429, "rate_limited");
    if (!res.ok) throw new HttpError(502, "vendor_unreachable");

    const body = (await res.json().catch(() => null)) as unknown;
    // Polar's docs do not state the top-level envelope for this list
    // response; accepted defensively as either a bare array or an object
    // carrying one, rather than asserting an unconfirmed wrapper key.
    const sessions: PolarSession[] = Array.isArray(body)
      ? (body as PolarSession[])
      : Array.isArray((body as { data?: unknown })?.data)
        ? (body as { data: PolarSession[] }).data
        : [];

    const out: WatchActivity[] = [];
    for (const s of sessions) {
      const mapped = mapSession(s);
      if (mapped) out.push(mapped);
    }
    return out;
  },

  revoke(): Promise<boolean> {
    // No revoke endpoint is published for either Polar generation. Delete
    // the row and return false — the client's copy sends the person to
    // account.polar.com to remove ICEFALL from their own side.
    return Promise.resolve(false);
  },

  canImport(scope: string): boolean {
    return scope.includes("training_sessions:read");
  },
};
