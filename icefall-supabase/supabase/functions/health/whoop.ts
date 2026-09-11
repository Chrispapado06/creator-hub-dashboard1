// WHOOP — recovery, HRV, sleep, strain.
//
// ════════════════════════════════════════════════════════════════════════════
// THE OBLIGATIONS, AND WHERE EACH ONE IS MET
// ════════════════════════════════════════════════════════════════════════════
//
// From WHOOP's API terms of use (ICEFALL-INTEGRATIONS.md §1A):
//
//   1. "must encrypt Whoop data at rest"
//      → MET in `crypto.ts`, which seals every token before it reaches the
//        database, and in the migration, whose token columns are documented as
//        holding ciphertext only. `index.ts` refuses to connect any vendor at
//        all when HEALTH_TOKEN_KEY is absent — there is no code path that
//        writes a WHOOP token in plaintext.
//
//   2. "ICEFALL may charge for its own features; may not compete with Whoop or
//      sell Whoop data"
//      → MET by what is NOT built: no export, no sharing, no third party
//        receives WHOOP data, and no WHOOP-derived number is put behind a
//        price of its own. There is no code here to point at, which is the
//        correct shape for a negative duty; this note is the record.
//
// ════════════════════════════════════════════════════════════════════════════
// WHAT WHOOP DOES NOT HAVE — and why that matters to the UI
// ════════════════════════════════════════════════════════════════════════════
//
// NO GPS TRACK. NO STEP COUNT. Neither is in the API at all. A WHOOP workout
// carries strain, heart-rate zones and altitude gain, and nothing that could
// draw a map. So no screen may offer "import my routes from WHOOP" or show a
// step tile fed from here — an absent capability presented as a switched-off
// one is the same lie as a fabricated reading. The scope list below is the
// evidence: there is no route scope to ask for.

import { HttpError, type TokenSet, type HealthAdapter } from "./registry.ts";

const AUTHORIZE = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";
const API = "https://api.prod.whoop.com/developer/v2";

/**
 * Exactly what ICEFALL displays, and nothing more.
 *
 * `offline` is what makes a refresh token possible; without it the connection
 * dies at the first expiry and the person has to reauthorise by hand. It is
 * requested because the alternative is worse for them, not because it widens
 * anything — it grants no data.
 *
 * `read:profile` is deliberately narrow: it is what lets the card say WHICH
 * WHOOP account this is, so somebody with two does not discover the wrong one
 * months later. Nothing beyond a name and an id is read from it.
 */
const SCOPES = [
  "read:recovery", // recovery score, HRV, resting heart rate, SpO2, skin temp
  "read:sleep", // sleep stages, sleep debt, sleep performance
  "read:cycles", // day strain
  "read:workout", // workout strain, HR zones, altitude gain
  "read:profile", // which account this is — see above
  "offline", // a refresh token, so the link survives an expiry
];

function clientId(): string {
  const id = Deno.env.get("WHOOP_CLIENT_ID");
  if (!id) throw new Error("Missing secret: WHOOP_CLIENT_ID");
  return id;
}

function clientSecret(): string {
  const s = Deno.env.get("WHOOP_CLIENT_SECRET");
  if (!s) throw new Error("Missing secret: WHOOP_CLIENT_SECRET");
  return s;
}

interface WhoopTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

function toTokenSet(t: WhoopTokenResponse): TokenSet {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    scope: t.scope ?? SCOPES.join(" "),
    apiBase: API,
    providerUserId: null, // filled by identify()
    accountLabel: null,
  };
}

async function postToken(form: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form,
  });
  if (!res.ok) throw new HttpError(res.status, "whoop_token_failed");
  return toTokenSet((await res.json()) as WhoopTokenResponse);
}

export const whoop: HealthAdapter = {
  provider: "whoop",
  gate: "none",
  gateReason: "",
  requiredSecrets: ["WHOOP_CLIENT_ID", "WHOOP_CLIENT_SECRET"],
  scopes: SCOPES,

  authorizeUrl(a: { state: string; redirectUri: string }): string {
    const url = new URL(AUTHORIZE);
    url.searchParams.set("client_id", clientId());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", a.redirectUri);
    url.searchParams.set("scope", SCOPES.join(" "));
    /* WHOOP rejects a `state` shorter than eight characters. The upstream
       state is a UUID, so this is always satisfied — noted rather than
       enforced here, because enforcing it in the adapter would hide a
       regression in the minting code instead of surfacing it. */
    url.searchParams.set("state", a.state);
    return url.toString();
  },

  exchange(a: { code: string; redirectUri: string }): Promise<TokenSet> {
    return postToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        code: a.code,
        redirect_uri: a.redirectUri,
        client_id: clientId(),
        client_secret: clientSecret(),
      }),
    );
  },

  refresh(a: { refreshToken: string }): Promise<TokenSet> {
    return postToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: a.refreshToken,
        client_id: clientId(),
        client_secret: clientSecret(),
        /* WHOOP's refresh returns a NEW refresh token only when `offline` is
           re-requested here; without it the rotation returns none and the
           connection quietly becomes single-use. */
        scope: "offline",
      }),
    );
  },

  async identify(a: {
    accessToken: string;
    apiBase: string;
  }): Promise<{ providerUserId: string | null; accountLabel: string | null }> {
    const res = await fetch(`${a.apiBase}/user/profile/basic`, {
      headers: { authorization: `Bearer ${a.accessToken}`, accept: "application/json" },
    });
    /* Best effort by contract — `index.ts` catches. A connection with an
       unnamed account is still a working connection, and the card says "WHOOP
       did not say which account this is" rather than inventing a label. */
    if (!res.ok) return { providerUserId: null, accountLabel: null };
    const body = (await res.json().catch(() => null)) as {
      user_id?: number | string;
      first_name?: string;
      last_name?: string;
    } | null;
    if (!body) return { providerUserId: null, accountLabel: null };
    const name = [body.first_name, body.last_name].filter(Boolean).join(" ").trim();
    return {
      providerUserId: body.user_id !== undefined ? String(body.user_id) : null,
      accountLabel: name || null,
    };
  },

  async revoke(a: { accessToken: string; apiBase: string }): Promise<boolean> {
    /*
     * WHOOP is the ONE of these four that publishes a revocation endpoint, so
     * it is the one where a disconnect can genuinely end the grant at the
     * vendor rather than only forgetting it here.
     *
     * The return value is measured, never assumed: a non-2xx answers false and
     * the app then tells the person to remove ICEFALL in their WHOOP account
     * to be certain. Reporting a revocation that did not happen would leave a
     * live grant on somebody's health data behind a screen that said it was
     * gone.
     */
    try {
      const res = await fetch(`${a.apiBase}/user/access`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${a.accessToken}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
