import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/backend/client";
import { readHealthConsent } from "@/health/consent";
import { OURA_LEGAL_HOLD, OURA_LEGAL_HOLD_SENTENCE } from "@/tracking/sources/oura";
import {
  HEALTH_PROVIDERS,
  type HealthAvailability,
  type HealthProvider,
  type HealthReturnPath,
} from "./types";

/**
 * HEALTH ACCOUNTS — the app's half of it.
 *
 * The same doctrine as `watch/connection.ts`, generalised to the four vendors
 * that hand over physiology rather than outings.
 *
 * ── THIS MODULE HOLDS NO SECRET AND SEES NO TOKEN ────────────────────────────
 *
 * Every call goes to the `health` Edge Function
 * (`icefall-supabase/supabase/functions/health/`). Each vendor's client id,
 * client secret and every athlete's tokens live server-side only, and the
 * tokens are stored as ciphertext the database itself cannot read.
 * `health_connections` has no read policy at all, so the browser could not
 * fetch them even if something here tried to.
 *
 * THIS IS A VITE BUNDLE. Anything named `VITE_*` is compiled into it and
 * served to every visitor. There is no version of this file that holds a
 * client secret, and the day one appears it has already leaked.
 *
 * ── THREE ORDERED FACTS PER CARD ─────────────────────────────────────────────
 *
 * A card's state answers, in this order, and never merges two of them:
 *
 *   1. Is this vendor switched off in ICEFALL's own code?   → `legal-hold`
 *   2. Can this build reach a server, signed in?            → `no-backend` /
 *                                                             `signed-out`
 *   3. Does ICEFALL hold credentials for the vendor?        → `needs-credentials`
 *   4. Has this person given the health-data permission?    → `consent-required`
 *   5. Then, and only then: connected or not.
 *
 * The order matters. Asking somebody for permission to store measurements from
 * a vendor ICEFALL cannot talk to would be asking for a decision that changes
 * nothing.
 */

/** Same rewrite as `watch/connection.ts`; null when VITE_SUPABASE_URL is unset. */
function functionUrl(path: string): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return null;
  return `${String(base).replace(".supabase.co", ".functions.supabase.co")}/health/${path}`;
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export type HealthProviderState =
  | "loading"
  | "connected"
  | "not-connected"
  | "no-backend"
  | "signed-out"
  | "unreachable"
  | "needs-credentials"
  | "consent-required"
  | "legal-hold";

export interface HealthConnection {
  provider: HealthProvider;
  state: HealthProviderState;
  accountLabel: string | null;
  providerUserId: string | null;
  connectedAt: string | null;
  /** What the vendor actually granted, as the vendor named it. */
  scope: string;
  /**
   * The server's own sentence for a gate, passed through unaltered. There is
   * exactly one copy of a reason and it is written where the decision was
   * made — never reworded here, where it would drift.
   */
  gateReason: string;
}

export interface HealthStatus {
  byProvider: Record<HealthProvider, HealthConnection>;
  loading: boolean;
  /** True when the person has NOT given the health-data permission and that is
   *  the thing standing in the way. Lets the screen offer one route to it
   *  rather than repeating the sentence on four cards. */
  consentMissing: boolean;
  reload(): void;
}

function emptyConnection(
  provider: HealthProvider,
  state: HealthProviderState,
  gateReason = "",
): HealthConnection {
  return {
    provider,
    state,
    accountLabel: null,
    providerUserId: null,
    connectedAt: null,
    scope: "",
    gateReason,
  };
}

/**
 * The one fact that is true before any network call.
 *
 * OURA IS OFF IN THIS BUILD, and it is off whether or not there is a server,
 * whether or not anybody is signed in, and whether or not credentials exist.
 * So it is decided here rather than waiting on `/providers` — a card that said
 * "Unavailable — this build runs without a server" would name the wrong reason
 * and imply that a server would fix it.
 *
 * This is the app's copy of a hold that also exists in the Edge Function
 * (`functions/health/oura.ts`) and in the Vercel functions
 * (`icefall-web/api/_oura.mjs`). Three separate locks, on purpose: no single
 * edit switches Oura on.
 */
function heldOff(provider: HealthProvider): HealthConnection | null {
  if (provider === "oura" && OURA_LEGAL_HOLD) {
    return emptyConnection("oura", "legal-hold", OURA_LEGAL_HOLD_SENTENCE);
  }
  return null;
}

function initialByProvider(state: HealthProviderState): Record<HealthProvider, HealthConnection> {
  const out = {} as Record<HealthProvider, HealthConnection>;
  for (const p of HEALTH_PROVIDERS) out[p] = heldOff(p) ?? emptyConnection(p, state);
  return out;
}

interface ProvidersWire {
  providers?: Record<
    string,
    { availability?: HealthAvailability; gateReason?: string; scopes?: string[] }
  >;
}

export function useHealthStatus(): HealthStatus {
  const [byProvider, setByProvider] = useState<Record<HealthProvider, HealthConnection>>(() =>
    initialByProvider("loading"),
  );
  const [loading, setLoading] = useState(true);
  const [consentMissing, setConsentMissing] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    void (async () => {
      if (!supabase) {
        if (alive) {
          setByProvider(initialByProvider("no-backend"));
          setLoading(false);
        }
        return;
      }

      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        if (alive) {
          setByProvider(initialByProvider("signed-out"));
          setLoading(false);
        }
        return;
      }

      const providersUrl = functionUrl("providers");
      let wire: ProvidersWire["providers"] | null = null;
      if (providersUrl) {
        try {
          const res = await fetch(providersUrl);
          const body = (await res.json().catch(() => ({}))) as ProvidersWire;
          if (res.ok && body.providers) wire = body.providers;
        } catch {
          wire = null;
        }
      }
      if (!alive) return;
      if (!wire) {
        setByProvider(initialByProvider("unreachable"));
        setLoading(false);
        return;
      }

      /*
       * THE ARTICLE 9 PERMISSION, READ ONCE FOR ALL FOUR CARDS.
       *
       * The server refuses to issue an authorize URL without it, so a card
       * that offered a Connect button here would offer a button that fails
       * after the tap. `unknown` is NOT treated as granted — "we could not
       * check" and "they said yes" are different facts and only one of them
       * is a reason to draw the button.
       */
      const consent = await readHealthConsent();
      if (!alive) return;
      const granted = consent.status === "granted";
      setConsentMissing(!granted);

      const next = {} as Record<HealthProvider, HealthConnection>;
      const readyProviders: HealthProvider[] = [];
      for (const p of HEALTH_PROVIDERS) {
        const held = heldOff(p);
        if (held) {
          next[p] = held;
          continue;
        }
        const entry = wire[p];
        const availability = entry?.availability;
        const gateReason = entry?.gateReason ?? "";
        if (availability === "legal-hold") {
          next[p] = emptyConnection(p, "legal-hold", gateReason);
        } else if (availability === "ready") {
          next[p] = emptyConnection(p, granted ? "not-connected" : "consent-required");
          if (granted) readyProviders.push(p);
        } else {
          /* Anything that is not `ready` and not a hold is ICEFALL not holding
             keys. An availability word this build has never heard of lands
             here too — the honest reading of "the server said something newer
             than I know" is not "connected". */
          next[p] = emptyConnection(p, "needs-credentials", gateReason);
        }
      }

      if (readyProviders.length === 0) {
        setByProvider(next);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc("health_status");
      if (!alive) return;
      if (error) {
        for (const p of readyProviders) next[p] = emptyConnection(p, "unreachable");
        setByProvider(next);
        setLoading(false);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      for (const p of readyProviders) {
        const row = rows.find((r: { provider: string }) => r.provider === p);
        if (!row) continue; // already `not-connected` above
        next[p] = {
          provider: p,
          state: "connected",
          accountLabel: row.account_label ?? null,
          providerUserId: row.provider_user_id ?? null,
          connectedAt: row.connected_at ?? null,
          scope: String(row.scope ?? ""),
          gateReason: "",
        };
      }

      setByProvider(next);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [nonce]);

  /* A re-measure is visibly a re-measure: every card drops back to "loading"
     first, so no control keeps acting on the answer being replaced. */
  const reload = useCallback(() => {
    setByProvider(initialByProvider("loading"));
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  return { byProvider, loading, consentMissing, reload };
}

/* -------------------------------------------------------------------------- */
/* Connecting                                                                  */
/* -------------------------------------------------------------------------- */

export type HealthConnectResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason: "no-backend" | "signed-out" | "consent-required" | "not-available" | "unreachable";
      gateReason?: string;
    };

export async function beginHealthConnect(
  provider: HealthProvider,
  opts?: { returnTo?: HealthReturnPath },
): Promise<HealthConnectResult> {
  /* The client-side lock. `functions/health/oura.ts` is the server one and
     `icefall-web/api/_oura.mjs` is the third; this one exists so a held vendor
     cannot even be asked for a URL. */
  if (provider === "oura" && OURA_LEGAL_HOLD) {
    return { ok: false, reason: "not-available", gateReason: OURA_LEGAL_HOLD_SENTENCE };
  }
  if (!supabase) return { ok: false, reason: "no-backend" };
  const url = functionUrl(`${provider}/begin`);
  if (!url) return { ok: false, reason: "no-backend" };

  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, reason: "signed-out" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ returnTo: opts?.returnTo }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
      gateReason?: string;
    };
    if (res.ok && body.url) return { ok: true, url: body.url };
    if (body.error === "consent_required") return { ok: false, reason: "consent-required" };
    if (body.error === "not_available") {
      return { ok: false, reason: "not-available", gateReason: body.gateReason };
    }
    if (body.error === "unauthenticated") return { ok: false, reason: "signed-out" };
    return { ok: false, reason: "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/* -------------------------------------------------------------------------- */
/* Finishing                                                                   */
/* -------------------------------------------------------------------------- */

export type HealthFinalizeOutcome =
  | {
      ok: true;
      provider: HealthProvider;
      accountLabel: string | null;
      /** False when a vendor that needs delivery set up did not get all of it.
       *  True for the vendors that need none — nothing to fail. */
      deliveryOk: boolean;
      /** Which categories did not subscribe, in the server's words. */
      deliveryDetail: string | null;
    }
  | {
      ok: false;
      reason:
        | "no-backend"
        | "signed-out"
        | "not-yours"
        | "invalid"
        | "expired"
        | "vendor"
        | "not-saved"
        | "not-encrypted"
        | "consent-required"
        | "not-available"
        | "unreachable";
      /** `not-saved` and `not-encrypted` only. */
      revokedAtVendor?: boolean;
    };

/*
 * ONE PRESENTATION PER TICKET PER PAGE LOAD — same reasoning as
 * `watch/connection.ts` and `strava/connection.ts`. Without it React
 * StrictMode's double effect burns the ticket on the first request and reports
 * "no longer valid" on the second, for a connection the server had just made.
 * Nothing is ever evicted: a second presentation of the same ticket can never
 * legitimately succeed.
 */
const inflight = new Map<string, Promise<HealthFinalizeOutcome>>();

export function finalizeHealthConnect(ticket: string): Promise<HealthFinalizeOutcome> {
  const held = inflight.get(ticket);
  if (held) return held;
  const p = finalizeOnce(ticket);
  inflight.set(ticket, p);
  return p;
}

async function finalizeOnce(ticket: string): Promise<HealthFinalizeOutcome> {
  if (!supabase) return { ok: false, reason: "no-backend" };
  /* The <provider> in the finalize path is ignored for lookup — the pending
     row the server reads carries the real one. Any valid literal satisfies the
     router's provider gate. */
  const url = functionUrl(`${HEALTH_PROVIDERS[0]}/finalize`);
  if (!url) return { ok: false, reason: "no-backend" };

  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, reason: "signed-out" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ticket }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      connected?: boolean;
      provider?: HealthProvider;
      accountLabel?: string | null;
      deliveryOk?: boolean;
      deliveryDetail?: string | null;
      error?: string;
      revokedAtVendor?: boolean;
    };
    if (res.ok && body.connected && body.provider) {
      return {
        ok: true,
        provider: body.provider,
        accountLabel: body.accountLabel ?? null,
        deliveryOk: body.deliveryOk !== false,
        deliveryDetail: body.deliveryDetail ?? null,
      };
    }
    if (body.error === "store_failed") {
      return { ok: false, reason: "not-saved", revokedAtVendor: body.revokedAtVendor === true };
    }
    if (body.error === "encryption_unavailable") {
      return { ok: false, reason: "not-encrypted", revokedAtVendor: body.revokedAtVendor === true };
    }
    const map: Record<string, Extract<HealthFinalizeOutcome, { ok: false }>["reason"]> = {
      ticket_not_yours: "not-yours",
      ticket_invalid: "invalid",
      ticket_expired: "expired",
      exchange_failed: "vendor",
      consent_required: "consent-required",
      not_available: "not-available",
      unauthenticated: "signed-out",
      no_ticket: "invalid",
    };
    return { ok: false, reason: map[body.error ?? ""] ?? "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/* -------------------------------------------------------------------------- */
/* Disconnecting                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Ends one connection.
 *
 * `revokedAtVendor` is REPORTED, NEVER ASSUMED. Only WHOOP of these four
 * publishes a revocation endpoint ICEFALL can call and Withings a signed one;
 * Polar and Oura publish none, so a truthful disconnect there is "ICEFALL has
 * forgotten this — remove ICEFALL in your own account to be certain", and the
 * screen says exactly that. Polar's agreement requires the TOKEN to be
 * deleted, and it is: the row goes, in the Edge Function, whatever the vendor
 * answered.
 */
export async function disconnectHealth(
  provider: HealthProvider,
): Promise<{ ok: boolean; revokedAtVendor: boolean }> {
  if (!supabase) return { ok: false, revokedAtVendor: false };
  const url = functionUrl(`${provider}/disconnect`);
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!url || !token) return { ok: false, revokedAtVendor: false };

  try {
    const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const body = (await res.json().catch(() => ({}))) as { revokedAtVendor?: boolean };
    return { ok: res.ok, revokedAtVendor: body.revokedAtVendor === true };
  } catch {
    /* The row is still removable without the function — `health_disconnect()`
       exists for exactly this, and for a token the vendor already revoked.
       What it cannot do is revoke, so that is reported as false rather than
       assumed. */
    await supabase.rpc("health_disconnect", { p_provider: provider });
    return { ok: true, revokedAtVendor: false };
  }
}
