// ICEFALL ↔ health accounts — the adapter interface and the provider table.
//
// One shape, four vendors. `index.ts` never branches on `provider` — it asks
// `ADAPTERS[provider]` for what it needs and calls the same methods on
// whichever one comes back. This is the same arrangement `watch/registry.ts`
// established, deliberately: two functions with one idea between them, rather
// than a second idea nobody remembers when the third one is written.

import type { HealthProvider } from "./types.ts";
import { polar } from "./polar.ts";
import { whoop } from "./whoop.ts";
import { oura } from "./oura.ts";
import { withings } from "./withings.ts";

/** Same class, same reasoning, as `watch/registry.ts`: a vendor's own 429
 *  becomes `rate_limited` inside the adapter that saw it, not two layers up. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO 8601
  scope: string;
  apiBase: string;
  providerUserId: string | null;
  accountLabel: string | null;
}

/**
 * A gate no amount of configuration removes.
 *
 * `legal-hold` is the interesting one. It is checked BEFORE credentials, so a
 * vendor on hold reports `legal-hold` even with a full set of keys present —
 * which is the point: the hold must not be liftable by an environment
 * variable, only by a person editing this file.
 */
export type HealthGate = "none" | "legal-hold";

export interface HealthAdapter {
  readonly provider: HealthProvider;
  readonly gate: HealthGate;
  /**
   * When `gate` is not "none", the sentence a human reads. Empty otherwise.
   * It is stated in the server's own words and passed through the client
   * unaltered, so there is exactly one copy of the reason.
   */
  readonly gateReason: string;
  /** All must be present in Deno.env for availability to be "ready".
   *  HEALTH_TOKEN_KEY is added to every vendor by `index.ts`, not here — no
   *  connection may be stored without encryption. */
  readonly requiredSecrets: readonly string[];
  /** The scopes ICEFALL asks the vendor for. Reported to the client so the
   *  screen's "what would be read" list can be checked against the grant that
   *  is actually requested, rather than drifting from it. */
  readonly scopes: readonly string[];

  authorizeUrl(a: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchange(a: { code: string; codeVerifier: string; redirectUri: string }): Promise<TokenSet>;
  refresh(a: { refreshToken: string }): Promise<TokenSet>;
  /** Fills identity the token response did not carry. May return all nulls. */
  identify(a: {
    accessToken: string;
    apiBase: string;
  }): Promise<{ providerUserId: string | null; accountLabel: string | null }>;
  /**
   * Ends the grant at the vendor. TRUE ONLY WHEN THE VENDOR CONFIRMED IT.
   *
   * Three of these four publish no revocation endpoint that ICEFALL could
   * verify, so three of them return false and the screen tells the person
   * where to finish the job themselves. Returning true to make a card look
   * tidy would be a claim about somebody else's system that ICEFALL cannot
   * make.
   */
  revoke(a: {
    accessToken: string;
    apiBase: string;
    providerUserId: string | null;
  }): Promise<boolean>;
  /**
   * Anything that must happen once, right after a successful connection.
   *
   * Withings is the only one that uses it, and it is the whole reason the
   * hook exists: its terms forbid polling, so the webhook subscriptions have
   * to be registered at connect time or the connection reads nothing, ever.
   * Returns a short machine word per attempt for the connect response —
   * never a thrown error, because a failed subscription must not undo a
   * connection the vendor has already granted.
   */
  afterConnect?(a: {
    accessToken: string;
    apiBase: string;
    providerUserId: string | null;
    callbackUrl: string;
  }): Promise<{ ok: boolean; detail: string }>;
}

export const ADAPTERS: Record<HealthProvider, HealthAdapter> = {
  polar,
  whoop,
  oura,
  withings,
};
