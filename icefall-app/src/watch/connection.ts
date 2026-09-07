import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/backend/client";
import { clearCursor, readCursor, writeCursor } from "./cursor";
import { importWatchActivity } from "@/tracking/import";
import {
  WATCH_PROVIDERS,
  type WatchActivity,
  type WatchAvailability,
  type WatchProvider,
  type WatchReturnPath,
} from "./types";

/**
 * WATCH ACCOUNTS — the app's half of it.
 *
 * The same doctrine as `strava/connection.ts`, generalised to four vendors.
 *
 * ── THIS MODULE HOLDS NO SECRET AND SEES NO TOKEN ────────────────────────────
 *
 * Every call goes to the `watch` Edge Function
 * (`icefall-supabase/supabase/functions/watch/`). Each vendor's client id,
 * client secret and every athlete's access token live server-side only;
 * `watch_connections` has no read policy at all, so the browser could not
 * fetch them even if something here tried to.
 */

/** Same rewrite as `strava/connection.ts:41-46`; null when VITE_SUPABASE_URL is unset. */
function functionUrl(path: string): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return null;
  return `${String(base).replace(".supabase.co", ".functions.supabase.co")}/watch/${path}`;
}

/**
 * Which granted permission makes an import possible, per vendor — the client
 * mirror of each server adapter's `canImport(scope)` (watch/registry.ts and
 * coros.ts / polar.ts / suunto.ts), the same duplication `canUpload` already
 * is for Strava (connection.ts:100-110). Garmin has no adapter yet, so its
 * connections never reach `"connected"` — the entry exists only so the record
 * type is total.
 */
const CAN_IMPORT_SCOPE: Record<WatchProvider, string> = {
  coros: "mcp.tools",
  polar: "training_sessions:read",
  suunto: "workout",
  garmin: "",
};

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export type WatchProviderState =
  | "loading"
  | "connected"
  | "not-connected"
  | "no-backend"
  | "signed-out"
  | "unreachable"
  | "needs-registration"
  | "vendor-approval-required"
  | "not-built";

export interface WatchConnection {
  provider: WatchProvider;
  state: WatchProviderState;
  accountLabel: string | null;
  providerUserId: string | null;
  region: "eu" | "us" | null;
  connectedAt: string | null;
  /** From the local cursor, not the server. Null = never imported. */
  lastImportAt: string | null;
  /** Connected AND granted the permission an import needs. Not the same thing. */
  canImport: boolean;
}

export interface WatchStatus {
  byProvider: Record<WatchProvider, WatchConnection>;
  loading: boolean;
  reload(): void;
}

function emptyConnection(provider: WatchProvider, state: WatchProviderState): WatchConnection {
  return {
    provider,
    state,
    accountLabel: null,
    providerUserId: null,
    region: null,
    connectedAt: null,
    lastImportAt: readCursor(provider).lastRunAt,
    canImport: false,
  };
}

function initialByProvider(state: WatchProviderState): Record<WatchProvider, WatchConnection> {
  const out = {} as Record<WatchProvider, WatchConnection>;
  for (const p of WATCH_PROVIDERS) out[p] = emptyConnection(p, state);
  return out;
}

export function useWatchStatus(): WatchStatus {
  const [byProvider, setByProvider] = useState<Record<WatchProvider, WatchConnection>>(() =>
    initialByProvider("loading"),
  );
  const [loading, setLoading] = useState(true);
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
      let availability: Record<WatchProvider, WatchAvailability> | null = null;
      if (providersUrl) {
        try {
          const res = await fetch(providersUrl);
          const body = (await res.json().catch(() => ({}))) as {
            providers?: Record<WatchProvider, WatchAvailability>;
          };
          if (res.ok && body.providers) availability = body.providers;
        } catch {
          availability = null;
        }
      }
      if (!alive) return;
      if (!availability) {
        setByProvider(initialByProvider("unreachable"));
        setLoading(false);
        return;
      }

      const next = {} as Record<WatchProvider, WatchConnection>;
      const readyProviders: WatchProvider[] = [];
      for (const p of WATCH_PROVIDERS) {
        const a = availability[p];
        const state: WatchProviderState =
          a === "not-built"
            ? "not-built"
            : a === "vendor-approval-required"
              ? "vendor-approval-required"
              : a === "needs-registration"
                ? "needs-registration"
                : "not-connected"; // provisional for "ready" — replaced below
        next[p] = emptyConnection(p, state);
        if (a === "ready") readyProviders.push(p);
      }

      if (readyProviders.length === 0) {
        setByProvider(next);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc("watch_status");
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
        if (!row) {
          next[p] = emptyConnection(p, "not-connected");
          continue;
        }
        const scope = String(row.scope ?? "");
        const cursor = readCursor(p);
        next[p] = {
          provider: p,
          state: "connected",
          accountLabel: row.account_label ?? null,
          providerUserId: row.provider_user_id ?? null,
          region: row.region ?? null,
          connectedAt: row.connected_at ?? null,
          lastImportAt: cursor.lastRunAt,
          canImport: CAN_IMPORT_SCOPE[p] !== "" && scope.includes(CAN_IMPORT_SCOPE[p]),
        };
      }

      setByProvider(next);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [nonce]);

  /* A re-measure is visibly a re-measure: every provider drops back to
     "loading" first, so no control keeps acting on the answer being
     replaced. */
  const reload = useCallback(() => {
    setByProvider(initialByProvider("loading"));
    setLoading(true);
    setNonce((n) => n + 1);
  }, []);

  return { byProvider, loading, reload };
}

/* -------------------------------------------------------------------------- */
/* Connecting                                                                  */
/* -------------------------------------------------------------------------- */

export type ConnectResult = { ok: true; url: string } | { ok: false; reason: string };

export async function beginWatchConnect(
  provider: WatchProvider,
  opts?: { returnTo?: WatchReturnPath; region?: "eu" | "us" },
): Promise<ConnectResult> {
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
      body: JSON.stringify({ returnTo: opts?.returnTo, region: opts?.region }),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !body.url) return { ok: false, reason: body.error ?? "unreachable" };
    return { ok: true, url: body.url };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/* -------------------------------------------------------------------------- */
/* Finishing                                                                   */
/* -------------------------------------------------------------------------- */

export type WatchFinalizeOutcome =
  | { ok: true; provider: WatchProvider; canImport: boolean; accountLabel: string | null }
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
        | "unreachable";
      /** `not-saved` only. */
      revokedAtVendor?: boolean;
    };

/*
 * ONE PRESENTATION PER TICKET PER PAGE LOAD — same reasoning as
 * `strava/connection.ts:210-227`. Without it, React StrictMode's double effect
 * would burn the ticket on the first request and report "no longer valid" on
 * the second, for a connection the server had just made. Nothing is ever
 * evicted — a second presentation of the same ticket can never legitimately
 * succeed.
 */
const inflight = new Map<string, Promise<WatchFinalizeOutcome>>();

export function finalizeWatchConnect(ticket: string): Promise<WatchFinalizeOutcome> {
  const held = inflight.get(ticket);
  if (held) return held;
  const p = finalizeOnce(ticket);
  inflight.set(ticket, p);
  return p;
}

async function finalizeOnce(ticket: string): Promise<WatchFinalizeOutcome> {
  if (!supabase) return { ok: false, reason: "no-backend" };
  // <provider> in the finalize path is ignored for lookup — the pending row
  // the server reads carries the real provider. This function's own signature
  // never receives one, so any valid provider literal satisfies the router's
  // `isProvider` gate; it changes nothing about which link gets finished.
  const url = functionUrl(`${WATCH_PROVIDERS[0]}/finalize`);
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
      provider?: WatchProvider;
      accountLabel?: string | null;
      scope?: string;
      canImport?: boolean;
      error?: string;
      revokedAtVendor?: boolean;
    };
    if (res.ok && body.connected && body.provider) {
      return {
        ok: true,
        provider: body.provider,
        canImport: body.canImport === true,
        accountLabel: body.accountLabel ?? null,
      };
    }
    if (body.error === "store_failed") {
      return { ok: false, reason: "not-saved", revokedAtVendor: body.revokedAtVendor === true };
    }
    const map: Record<string, Extract<WatchFinalizeOutcome, { ok: false }>["reason"]> = {
      ticket_not_yours: "not-yours",
      ticket_invalid: "invalid",
      ticket_expired: "expired",
      exchange_failed: "vendor",
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
 * `clearCursor(provider)` runs on every disconnect attempt, successful or
 * not, so a later reconnect always starts a clean import window rather than
 * resuming a stale one — a cursor pointing at an account this device is no
 * longer connected to is not useful to keep.
 */
export async function disconnectWatch(
  provider: WatchProvider,
): Promise<{ ok: boolean; revokedAtVendor: boolean }> {
  clearCursor(provider);
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
    /* The row is still removable without the function — `watch_disconnect()`
       exists for exactly this, and for a token the vendor already revoked.
       What it cannot do is deauthorise, so that is reported as false rather
       than assumed. */
    await supabase.rpc("watch_disconnect", { p_provider: provider });
    return { ok: true, revokedAtVendor: false };
  }
}

/* -------------------------------------------------------------------------- */
/* Importing                                                                   */
/* -------------------------------------------------------------------------- */

export type ImportFailure =
  | "no-backend"
  | "signed-out"
  | "not-connected"
  | "not-available"
  | "revoked"
  | "vendor-unreachable"
  | "rate-limited"
  | "no-mapping"
  | "unreachable";

export type ImportOutcome =
  | { ok: true; imported: number; skipped: number; through: string }
  | { ok: false; reason: ImportFailure };

/** A runaway catch-up loop against a rate-limited third party would hit an
    application-wide cap for every ICEFALL user, not just this one — the same
    reasoning `oura.ts`'s bounded `backfill()` already gives. */
const MAX_PAGES = 12;

/**
 * Pull whatever is new since the local cursor, hand each one to
 * `importWatchActivity`, and move the cursor to what the server actually
 * covered.
 *
 * `deep = true` ignores the cursor and pulls the full window the vendor
 * allows. MUST be called with `deep:true` immediately after a successful
 * COROS finalize: COROS opens a deeper-history window for roughly 24 hours
 * after authorization and never again without a reconnect.
 *
 * The route enforces its own per-vendor window cap and reports `through` —
 * the end of what it actually covered, which may be short of `now` when the
 * cap bit. This loop keeps asking from that point, bounded by `MAX_PAGES`, so
 * a connection that has not been checked in a long time still catches up
 * fully rather than only ever seeing the vendor's most recent window.
 */
export async function importWatchActivities(
  provider: WatchProvider,
  opts?: { deep?: boolean },
): Promise<ImportOutcome> {
  if (!supabase) return { ok: false, reason: "no-backend" };
  const activitiesUrl = functionUrl(`${provider}/activities`);
  if (!activitiesUrl) return { ok: false, reason: "no-backend" };

  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, reason: "signed-out" };

  // A cheap, public precondition check before spending an authenticated call
  // on a provider whose credentials ICEFALL does not hold yet, or that the
  // vendor has not approved — `not-available` says so rather than a raw
  // server error.
  const providersUrl = functionUrl("providers");
  if (providersUrl) {
    try {
      const res = await fetch(providersUrl);
      const body = (await res.json().catch(() => ({}))) as {
        providers?: Record<WatchProvider, WatchAvailability>;
      };
      if (res.ok && body.providers && body.providers[provider] !== "ready") {
        return { ok: false, reason: "not-available" };
      }
    } catch {
      /* If the public check itself is unreachable, fall through and let the
         authenticated call below report the real failure. */
    }
  }

  const nowIso = new Date().toISOString();
  let sinceIso = opts?.deep ? undefined : (readCursor(provider).through ?? undefined);
  let imported = 0;
  let skipped = 0;
  let through = sinceIso ?? nowIso;

  for (let page = 0; page < MAX_PAGES; page++) {
    let res: Response;
    try {
      res = await fetch(activitiesUrl, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ sinceIso, untilIso: nowIso }),
      });
    } catch {
      return { ok: false, reason: "vendor-unreachable" };
    }

    const body = (await res.json().catch(() => ({}))) as {
      activities?: WatchActivity[];
      through?: string;
      error?: string;
    };

    if (!res.ok) {
      const map: Record<string, ImportFailure> = {
        unauthenticated: "signed-out",
        not_connected: "not-connected",
        vendor_revoked: "revoked",
        rate_limited: "rate-limited",
        vendor_unreachable: "vendor-unreachable",
      };
      return { ok: false, reason: map[body.error ?? ""] ?? "unreachable" };
    }

    try {
      for (const w of body.activities ?? []) {
        const result = importWatchActivity(w, provider);
        if (result.written) imported++;
        else skipped++;
      }
    } catch {
      // The shape ICEFALL got back did not match what it knows how to read.
      // Nothing already written in an earlier page of this same call is
      // undone — it was written honestly — but the cursor is not advanced
      // past this page, so the same gap is retried next time rather than
      // silently skipped.
      return { ok: false, reason: "no-mapping" };
    }

    through = body.through ?? nowIso;
    if (through >= nowIso || !(body.activities ?? []).length) break;
    sinceIso = through;
  }

  writeCursor(provider, { through, lastRunAt: nowIso });
  return { ok: true, imported, skipped, through };
}
