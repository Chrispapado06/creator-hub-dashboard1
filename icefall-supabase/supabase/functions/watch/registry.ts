// ICEFALL ↔ watch accounts — the adapter interface and the provider table.
//
// One shape, four vendors. `index.ts` never branches on `provider` itself —
// it asks `ADAPTERS[provider]` for what it needs and calls the same six
// methods on whichever one comes back. A fifth vendor is a fifth entry here
// and nothing else changes in index.ts.

import type { WatchActivity, WatchProvider } from "./types.ts";
import { coros } from "./coros.ts";
import { polar } from "./polar.ts";
import { suunto } from "./suunto.ts";

/**
 * Same shape as strava/index.ts:206-210, copied verbatim. It lives here
 * rather than in index.ts because the adapters need to throw it too (a
 * vendor's own 429 becomes `rate_limited` inside the adapter that saw it,
 * not two layers up) and index.ts already imports this module for
 * `ADAPTERS` — putting the class where every file already has an import
 * path to it avoids a circular import between index.ts and the adapters.
 */
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
  refreshToken: string | null; // Polar v3 issues none; keep nullable
  expiresAt: string; // ISO 8601
  scope: string;
  apiBase: string;
  providerUserId: string | null;
  accountLabel: string | null;
}

export interface WatchAdapter {
  readonly provider: WatchProvider;
  /** A gate no amount of configuration removes. */
  readonly gate: "none" | "vendor-approval-required" | "not-built";
  /** All must be present in Deno.env for availability to be "ready". */
  readonly requiredSecrets: readonly string[];
  /** Server-side cap on one activities window, in days. */
  readonly maxWindowDays: number;
  /** True only for COROS. Any region on another provider is a 400. */
  readonly regional: boolean;

  apiBaseFor(region: string | null): string;
  authorizeUrl(a: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
    region: string | null;
  }): string;
  exchange(a: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    region: string | null;
  }): Promise<TokenSet>;
  refresh(a: { refreshToken: string; region: string | null }): Promise<TokenSet>;
  /** Fills identity the token response did not carry. May return all nulls. */
  identify(a: {
    accessToken: string;
    apiBase: string;
  }): Promise<{ providerUserId: string | null; accountLabel: string | null; scope: string }>;
  listActivities(a: {
    accessToken: string;
    apiBase: string;
    sinceIso: string;
    untilIso: string;
  }): Promise<WatchActivity[]>;
  /** true only when the vendor confirmed the grant is gone. */
  revoke(a: { accessToken: string; apiBase: string }): Promise<boolean>;
  /** Which granted scope/permission makes an import possible. */
  canImport(scope: string): boolean;
}

/**
 * GARMIN — no adapter file, by the contract. Two blockers, both outside
 * ICEFALL's control:
 *
 *   1. Access model. Garmin's Activity API program is not obtainable through
 *      any form on Garmin's site as of this writing — email is the only way
 *      in, and nobody has started that conversation yet.
 *   2. Delivery model. Garmin has no polling-only mode: "All data must be
 *      consumed through" ping/pull or push, both of which require a publicly
 *      reachable webhook endpoint that Garmin itself calls. `/watch/<p>/webhook`
 *      is explicitly out of scope until a vendor approval lands in the same
 *      change (see index.ts's router comment) — so Garmin cannot work even
 *      technically until that route exists.
 *
 * Before writing a real adapter: read Garmin's gated Developer Portal REST
 * spec (host `apis.garmin.com` vs the older `healthapi.garmin.com` needs
 * confirming), the activity-type enum, and the exact backfill window — none
 * of that is in the public docs this file was written against.
 */
const garmin: WatchAdapter = {
  provider: "garmin",
  gate: "not-built",
  requiredSecrets: [],
  maxWindowDays: 0,
  regional: false,
  apiBaseFor(): string {
    throw new Error("garmin adapter not built");
  },
  authorizeUrl(): string {
    throw new Error("garmin adapter not built");
  },
  exchange(): Promise<TokenSet> {
    throw new Error("garmin adapter not built");
  },
  refresh(): Promise<TokenSet> {
    throw new Error("garmin adapter not built");
  },
  identify(): Promise<{
    providerUserId: string | null;
    accountLabel: string | null;
    scope: string;
  }> {
    throw new Error("garmin adapter not built");
  },
  listActivities(): Promise<WatchActivity[]> {
    throw new Error("garmin adapter not built");
  },
  revoke(): Promise<boolean> {
    throw new Error("garmin adapter not built");
  },
  canImport(): boolean {
    return false;
  },
};

export const ADAPTERS: Record<WatchProvider, WatchAdapter> = {
  coros,
  polar,
  suunto,
  garmin,
};
