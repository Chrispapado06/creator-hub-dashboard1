// COROS — the self-serve MCP tier (open.coros.com's Partner API needs a
// signed agreement; this adapter uses the tier anyone can register for).
//
// Verified against COROS's own live OAuth discovery documents (fetched
// 2026-09-07): https://mcpus.coros.com/.well-known/oauth-authorization-server
// and the mirrored EU issuer. Everything under AUTH below is taken from that
// document or from COROS's own reference login script, not guessed.
//
// ⚠️ ACTIVITY DATA IS A STUB. COROS publishes tool NAMES for its MCP server
// (coroslab/COROS-MCP) but no response SCHEMA. `listActivities` therefore
// returns `[]` and maps nothing — see the function for the full reasoning.
// Do not fill this in from a guess; read a real `tools/list` / `tools/call`
// response first and write the mapper here with the date it was read.

import type { WatchActivity } from "./types.ts";
import { HttpError, type TokenSet, type WatchAdapter } from "./registry.ts";

/** Region-pinned issuers. COROS accounts are region-sharded; the issuer
 *  genuinely differs per user, which is why `region` is a first-class
 *  parameter everywhere in this adapter rather than a constant. */
const ISSUER: Record<"eu" | "us", string> = {
  eu: "https://mcpeu.coros.com",
  us: "https://mcpus.coros.com",
};

/**
 * openid    — carries an id_token, whose `sub` claim is COROS's OIDC
 *             subject: the join key the migration stores as provider_user_id.
 * offline_access — issues a refresh token.
 * mcp.tools — the permission that actually lets ICEFALL call querySportRecords
 *             and friends. `canImport` checks for exactly this.
 */
const SCOPE = "openid offline_access mcp.tools";

/** Positive narrowing on purpose: negating a literal against a plain
 *  `string`-typed parameter does not narrow it to `"eu" | "us"` in
 *  TypeScript, since `string` is not enumerable the way a literal union is.
 *  Matching the literals directly does narrow, in both directions. */
function toRegion(region: string | null): "eu" | "us" {
  if (region === "eu" || region === "us") return region;
  throw new Error("coros requires region 'eu' or 'us'");
}

function issuerFor(region: string | null): string {
  return ISSUER[toRegion(region)];
}

/** Client id is per region — COROS's DCR registration endpoint differs per
 *  issuer, so a client registered against the EU issuer is not a valid
 *  client_id against the US one. */
function clientIdFor(region: "eu" | "us"): string {
  const name = region === "eu" ? "COROS_CLIENT_ID_EU" : "COROS_CLIENT_ID_US";
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret: ${name}`);
  return v;
}

/** Derive the region back out of a stored `apiBase` (the issuer URL), for the
 *  calls that only receive `apiBase` and not `region` — revoke() in this
 *  adapter's interface. */
function regionFromApiBase(apiBase: string): "eu" | "us" {
  if (apiBase.includes("mcpeu.")) return "eu";
  if (apiBase.includes("mcpus.")) return "us";
  throw new Error(`Cannot determine COROS region from apiBase: ${apiBase}`);
}

interface CorosTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  token_type?: string;
}

/**
 * Decode the `sub` claim out of an OIDC id_token, WITHOUT verifying the
 * signature — this is only ever used to read COROS's own subject identifier
 * back off a token COROS itself just issued to us over TLS, not to accept a
 * bearer credential from an untrusted party. No claim other than `sub` is
 * read. Returns null on anything that doesn't parse as a JWT.
 */
function subFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

async function tokenRequest(
  issuer: string,
  clientId: string,
  params: Record<string, string>,
): Promise<CorosTokenResponse> {
  const res = await fetch(`${issuer}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    // Public client, token_endpoint_auth_method "none" — NO client_secret.
    body: new URLSearchParams({ client_id: clientId, ...params }),
  });
  // Status is preserved (not collapsed into a generic Error) so
  // `usableToken` in index.ts can tell a 400/401 revoke apart from any other
  // failure, per the contract's generalised `usableToken`.
  if (!res.ok) throw new HttpError(res.status, "coros_token_failed");
  return (await res.json()) as CorosTokenResponse;
}

function toTokenSet(issuer: string, t: CorosTokenResponse): TokenSet {
  /*
   * expires_in fallback: COROS's own reference login script defaults to 3600
   * only when the server response omits the field — that is COROS's own
   * client's documented behaviour, not a figure this file invented. COROS
   * publishes no token lifetime otherwise.
   */
  const expiresInSec = t.expires_in ?? 3600;
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    scope: t.scope ?? "",
    apiBase: issuer,
    providerUserId: subFromIdToken(t.id_token),
    accountLabel: null, // COROS's token/id_token carries no display name
  };
}

export const coros: WatchAdapter = {
  provider: "coros",
  gate: "none",
  requiredSecrets: ["COROS_CLIENT_ID_EU", "COROS_CLIENT_ID_US"],
  maxWindowDays: 30,
  regional: true,

  apiBaseFor(region: string | null): string {
    return issuerFor(region);
  },

  authorizeUrl(a: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
    region: string | null;
  }): string {
    const issuer = issuerFor(a.region);
    const clientId = clientIdFor(toRegion(a.region));
    const url = new URL(`${issuer}/oauth2/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", a.redirectUri);
    url.searchParams.set("state", a.state);
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("code_challenge", a.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    // RFC 8707 — COROS's own client sends it. Do not drop it.
    url.searchParams.set("resource", `${issuer}/mcp`);
    return url.toString();
  },

  async exchange(a: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    region: string | null;
  }): Promise<TokenSet> {
    const issuer = issuerFor(a.region);
    const clientId = clientIdFor(toRegion(a.region));
    const t = await tokenRequest(issuer, clientId, {
      grant_type: "authorization_code",
      code: a.code,
      redirect_uri: a.redirectUri,
      code_verifier: a.codeVerifier,
    });
    return toTokenSet(issuer, t);
  },

  async refresh(a: { refreshToken: string; region: string | null }): Promise<TokenSet> {
    const issuer = issuerFor(a.region);
    const clientId = clientIdFor(toRegion(a.region));
    const t = await tokenRequest(issuer, clientId, {
      grant_type: "refresh_token",
      refresh_token: a.refreshToken,
    });
    return toTokenSet(issuer, t);
  },

  identify(): Promise<{
    providerUserId: string | null;
    accountLabel: string | null;
    scope: string;
  }> {
    /*
     * Nothing confirmed to call here. The identity COROS gives us — the OIDC
     * subject — already arrives on the id_token inside `exchange()`, which is
     * the one confirmed source (the migration's own comment names "the OIDC
     * subject" as the join key). There is no second, separately-confirmed
     * identity endpoint to fall back to, so this returns nulls rather than
     * guess one — exactly the allowance the interface documents.
     */
    return Promise.resolve({ providerUserId: null, accountLabel: null, scope: "" });
  },

  listActivities(): Promise<WatchActivity[]> {
    /*
     * ⚠️ STUB, DELIBERATELY. COROS publishes the MCP tool NAME
     * (`querySportRecords`) and a prose description, but no response SCHEMA —
     * confirmed by reading COROS's own docs on 2026-09-07. Guessing field
     * names here would violate the one rule this file cannot break: never
     * invent a figure.
     *
     * To finish this: make one authenticated `tools/list` call against
     * `{apiBase}/mcp` (stateless MCP — send NO `Mcp-Session-Id` header) with a
     * real COROS account, read the actual `querySportRecords` output shape,
     * and write the mapper to `WatchActivity` right here, with the date that
     * response was read in a comment beside it. Do not call
     * `downloadActivityFitFiles` or `queryActivityFitFileDownloadUrls` — the
     * 50-files-per-account-per-day quota and v1's no-track scope make that
     * the wrong tool for this feature.
     */
    return Promise.resolve([]);
  },

  async revoke(a: { accessToken: string; apiBase: string }): Promise<boolean> {
    try {
      const region = regionFromApiBase(a.apiBase);
      const clientId = clientIdFor(region);
      const res = await fetch(`${a.apiBase}/oauth2/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          token: a.accessToken,
          token_type_hint: "access_token",
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  canImport(scope: string): boolean {
    return scope.includes("mcp.tools");
  },
};
