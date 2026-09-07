import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/backend/client";
import type { RecordedActivity } from "@/tracking/types";

/**
 * STRAVA — the app's half of it.
 *
 * The owner, 2026-09-07: "add feature where my users can implement strava data
 * into our app".
 *
 * ── THIS MODULE HOLDS NO SECRET AND SEES NO TOKEN ────────────────────────────
 *
 * Every call here goes to the `strava` Edge Function
 * (`icefall-supabase/supabase/functions/strava/`). The client id, the client
 * secret and the athlete's access token all live server-side; the browser never
 * receives any of them, and `strava_connections` has no read policy at all so
 * it could not fetch them if it tried.
 *
 * That is not caution for its own sake. A Strava access token is a bearer
 * credential — anything holding it can post activities as that athlete — so an
 * XSS anywhere in this app would otherwise become an XSS on somebody's Strava
 * account.
 *
 * ── WHAT THE APP IS ALLOWED TO KNOW ──────────────────────────────────────────
 *
 * `strava_status()` returns four facts and no token material: connected, which
 * athlete, what scope was granted, and when. The scope matters and is not
 * decoration — Strava lets people untick permissions on the consent screen, so
 * "connected" and "can upload" are genuinely different states and this module
 * keeps them apart.
 *
 * ── NOTHING WORKS UNTIL THE FUNCTION IS DEPLOYED ─────────────────────────────
 *
 * With no Supabase client (a DEMO build) or no deployed function, every call
 * here reports a specific reason rather than a generic failure. A connect
 * button that spins forever because a secret is unset is the worst version of
 * this feature.
 */

/** Where the function lives. Same project, `functions.supabase.co` host. */
function functionUrl(path: string): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return null;
  return `${String(base).replace(".supabase.co", ".functions.supabase.co")}/strava/${path}`;
}

/* -------------------------------------------------------------------------- */
/* Status                                                                      */
/* -------------------------------------------------------------------------- */

export interface StravaStatus {
  state: "loading" | "connected" | "not-connected" | "no-backend" | "signed-out" | "unreachable";
  athleteId: number | null;
  athleteUsername: string | null;
  /** What Strava actually granted. */
  scope: string;
  connectedAt: string | null;
  /** Connected AND permitted to upload. The two are not the same. */
  canUpload: boolean;
  reload(): void;
}

export function useStravaStatus(): StravaStatus {
  const [s, setS] = useState<Omit<StravaStatus, "reload">>({
    state: "loading",
    athleteId: null,
    athleteUsername: null,
    scope: "",
    connectedAt: null,
    canUpload: false,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    void (async () => {
      if (!supabase) {
        if (alive) setS((p) => ({ ...p, state: "no-backend" }));
        return;
      }
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        if (alive) setS((p) => ({ ...p, state: "signed-out" }));
        return;
      }

      const { data, error } = await supabase.rpc("strava_status");
      if (!alive) return;
      if (error) {
        setS((p) => ({ ...p, state: "unreachable" }));
        return;
      }
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) {
        setS((p) => ({ ...p, state: "not-connected" }));
        return;
      }
      const scope = String(row.scope ?? "");
      setS({
        state: "connected",
        athleteId: typeof row.athlete_id === "number" ? row.athlete_id : null,
        athleteUsername: row.athlete_username ?? null,
        scope,
        connectedAt: row.connected_at ?? null,
        /* The permission the whole feature depends on. Connected without it is
           a real and reachable state — Strava's consent screen lets somebody
           untick it — and the UI must be able to say so. */
        canUpload: scope.includes("activity:write"),
      });
    })();

    return () => {
      alive = false;
    };
  }, [nonce]);

  /* A re-measure is visibly a re-measure: the state drops back to `loading`
     first, so no control keeps acting on the answer that is being replaced. */
  const reload = useCallback(() => {
    setS((p) => ({ ...p, state: "loading" }));
    setNonce((n) => n + 1);
  }, []);
  return { ...s, reload };
}

/* -------------------------------------------------------------------------- */
/* Connecting                                                                  */
/* -------------------------------------------------------------------------- */

export type ConnectResult = { ok: true; url: string } | { ok: false; reason: string };

/**
 * Ask the function to begin, then send the athlete to Strava.
 *
 * THE URL IS BUILT SERVER-SIDE, not here, and that is the point: it carries a
 * single-use `state` bound to this user. Built in the browser it would be
 * unbound, and an unbound OAuth callback lets somebody attach their Strava
 * account to another person's ICEFALL profile.
 */
/**
 * Where Strava sends the athlete back to, inside the app. Two screens begin the
 * flow and each wants the person returned to itself. The function holds the
 * allowlist; this type is the app-side mirror of it, so a typo here is a compile
 * error rather than a silent fall-back to settings.
 */
export type StravaReturnPath = "/settings/connections" | "/connect";

export async function beginStravaConnect(
  returnTo: StravaReturnPath = "/settings/connections",
): Promise<ConnectResult> {
  if (!supabase) return { ok: false, reason: "no-backend" };
  const url = functionUrl("begin");
  if (!url) return { ok: false, reason: "no-backend" };

  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, reason: "signed-out" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ returnTo }),
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

export type FinalizeOutcome =
  | { ok: true; canUpload: boolean; athleteUsername: string | null; athleteId: number | null }
  | {
      ok: false;
      reason:
        | "no-backend"
        | "signed-out"
        | "not-yours"
        | "invalid"
        | "expired"
        | "strava"
        | "not-saved"
        | "unreachable";
      /** `not-saved` only: whether the grant Strava had issued was revoked again. */
      revokedAtStrava?: boolean;
    };

/**
 * Finish a connection Strava has granted.
 *
 * The callback that received Strava's consent had no ICEFALL session, so it
 * could not know who was holding the browser. It parked the consent under a
 * one-time `ticket` and sent the person back here. THIS call carries the
 * session, and the function finishes the link only when the ticket was minted
 * for the caller — a consent URL started by one account can never attach a
 * different person's Strava to it.
 *
 * The answer is MEASURED: what comes back is what was written, including
 * whether the upload permission was actually granted. Screens draw "connected"
 * from this, never from the address bar.
 */
/*
 * ONE PRESENTATION PER TICKET PER PAGE LOAD. A ticket is single-use on the
 * server, and React's StrictMode runs every mount effect twice in development
 * — so without this the first request would burn the ticket and store the
 * link, the second would be told `ticket_invalid`, and the surviving effect
 * would show "no longer valid" for a connection the server had just made.
 * Every caller for the same ticket shares one promise; nothing is evicted,
 * because a second presentation can never legitimately succeed.
 */
const inflight = new Map<string, Promise<FinalizeOutcome>>();

export function finalizeStravaConnect(ticket: string): Promise<FinalizeOutcome> {
  const held = inflight.get(ticket);
  if (held) return held;
  const p = finalizeOnce(ticket);
  inflight.set(ticket, p);
  return p;
}

async function finalizeOnce(ticket: string): Promise<FinalizeOutcome> {
  if (!supabase) return { ok: false, reason: "no-backend" };
  const url = functionUrl("finalize");
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
      canUpload?: boolean;
      athleteUsername?: string | null;
      athleteId?: number | null;
      error?: string;
      revokedAtStrava?: boolean;
    };
    if (res.ok && body.connected) {
      return {
        ok: true,
        canUpload: body.canUpload === true,
        athleteUsername: body.athleteUsername ?? null,
        athleteId: typeof body.athleteId === "number" ? body.athleteId : null,
      };
    }
    if (body.error === "store_failed") {
      return { ok: false, reason: "not-saved", revokedAtStrava: body.revokedAtStrava === true };
    }
    const map: Record<string, Extract<FinalizeOutcome, { ok: false }>["reason"]> = {
      ticket_not_yours: "not-yours",
      ticket_invalid: "invalid",
      ticket_expired: "expired",
      exchange_failed: "strava",
      unauthenticated: "signed-out",
    };
    return { ok: false, reason: map[body.error ?? ""] ?? "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** One sentence per way `finalize` can refuse — said to the person, never a code. */
export const FINALIZE_COPY: Record<Extract<FinalizeOutcome, { ok: false }>["reason"], string> = {
  "no-backend": "This build of ICEFALL runs without a server, so no account can be linked from it.",
  /* Said as it is: the ticket cannot be carried through a sign-in, so the
     request is over. Promising that signing in would finish it would be a
     promise nothing in the app keeps. */
  "signed-out":
    "You were signed out before Strava sent you back, so this connection request could not be finished and cannot be resumed. Nothing was linked. Sign in and start the connection again.",
  "not-saved":
    "Strava granted the permission, but ICEFALL could not save the connection. Nothing is linked here — start it again in a moment.",
  "not-yours":
    "That Strava consent was started from a different ICEFALL account, so it was not linked to this one. Nothing was stored. Start the connection again from here.",
  invalid:
    "That connection request is no longer valid — each one can be used once. Start it again.",
  expired:
    "That connection request is no longer valid — each one lasts ten minutes. Start it again.",
  strava: "Strava did not complete the connection. Nothing was linked — try again in a moment.",
  unreachable:
    "ICEFALL could not finish the connection. Nothing was linked — try again in a moment.",
};

export async function disconnectStrava(): Promise<{ ok: boolean; revokedAtStrava: boolean }> {
  if (!supabase) return { ok: false, revokedAtStrava: false };
  const url = functionUrl("disconnect");
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!url || !token) return { ok: false, revokedAtStrava: false };

  try {
    const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const body = (await res.json().catch(() => ({}))) as { revokedAtStrava?: boolean };
    return { ok: res.ok, revokedAtStrava: body.revokedAtStrava === true };
  } catch {
    /* The row is still removable without the function — `strava_disconnect()`
       exists for exactly this, and for a token Strava has already revoked. What
       it cannot do is deauthorise, so that is reported as false rather than
       assumed. */
    await supabase.rpc("strava_disconnect");
    return { ok: true, revokedAtStrava: false };
  }
}

/* -------------------------------------------------------------------------- */
/* Uploading                                                                   */
/* -------------------------------------------------------------------------- */

export type UploadFailure =
  | "no-backend"
  | "signed-out"
  | "not-connected"
  | "missing-scope"
  | "no-track"
  | "revoked"
  | "rejected"
  | "unreachable";

export type UploadOutcome =
  | { ok: true; uploadId: number | null }
  | { ok: false; reason: UploadFailure };

/**
 * Send one recorded activity to Strava as a GPX.
 *
 * ONLY THE TRACK AND THE TITLE ARE SENT — not the calorie estimate, not the
 * readiness score, not anything ICEFALL modelled. Strava derives distance,
 * elevation and time from the track itself, and sending our numbers alongside
 * would be asserting a second set of figures for the same effort. What was
 * measured travels; what was estimated stays here.
 *
 * A SIMULATED ACTIVITY IS REFUSED. `RecordedActivity.simulated` marks a track
 * produced by the labelled simulator rather than a real fix, and uploading one
 * would put a fabricated ascent on somebody's public profile — the one place it
 * would be read as a claim about them.
 */
export async function uploadToStrava(activity: RecordedActivity): Promise<UploadOutcome> {
  if (activity.simulated) return { ok: false, reason: "no-track" };
  if (!supabase) return { ok: false, reason: "no-backend" };
  const url = functionUrl("upload");
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!url) return { ok: false, reason: "no-backend" };
  if (!token) return { ok: false, reason: "signed-out" };

  const points = activity.points
    .filter((p) => !p.simulated && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => ({
      t: p.t,
      lat: p.lat,
      lon: p.lon,
      /* The SMOOTHED altitude, which is the one every other surface in this app
         shows. Sending the raw fix would put a different elevation profile on
         Strava than the athlete saw here. */
      altitude: p.altitudeSmoothed ?? p.altitude,
    }));

  if (points.length < 2) return { ok: false, reason: "no-track" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        name: activity.title,
        activityTypeId: activity.activityTypeId,
        points,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { uploadId?: number; error?: string };
    if (res.ok) return { ok: true, uploadId: body.uploadId ?? null };

    /* The function's own error codes, translated once. An unknown code falls
       through to `unreachable` rather than being shown raw — a climber should
       never read `PGRST204` or `upload_rejected` off a screen. */
    const map: Record<string, UploadFailure> = {
      not_connected: "not-connected",
      missing_scope: "missing-scope",
      no_track: "no-track",
      strava_revoked: "revoked",
      upload_rejected: "rejected",
    };
    return { ok: false, reason: map[body.error ?? ""] ?? "unreachable" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * WHAT STRAVA'S 201 ACTUALLY MEANS, said on the screen.
 *
 * The upload endpoint is asynchronous: a success means the file is QUEUED, not
 * that it is on the athlete's profile. Strava can still reject it minutes later
 * — most often as a duplicate of an activity their watch already recorded — and
 * a screen that said "Uploaded to Strava" would have claimed an outcome nobody
 * has yet.
 */
export const STRAVA_QUEUED =
  "Sent to Strava. Strava processes uploads in the background, so it appears on your profile shortly — or is rejected there as a duplicate if your watch recorded the same outing.";

export const STRAVA_NOT_CONNECTED = "Connect Strava first, in Settings.";

export const STRAVA_MISSING_SCOPE =
  "Strava is connected, but permission to add activities was not granted. Reconnect and leave that box ticked.";

export const STRAVA_REVOKED =
  "Strava no longer accepts this connection — it was most likely removed from your Strava settings. Connect it again.";

export const STRAVA_NO_TRACK =
  "This activity has no recorded track, so there is nothing to send. Strava would show it as a workout with no route.";

export const STRAVA_UNREACHABLE =
  "ICEFALL could not reach Strava. Nothing was sent, and nothing was changed.";
