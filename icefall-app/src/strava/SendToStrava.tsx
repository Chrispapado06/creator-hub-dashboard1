import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/primitives";
import type { RecordedActivity } from "@/tracking/types";
import {
  STRAVA_MISSING_SCOPE,
  STRAVA_NO_TRACK,
  STRAVA_QUEUED,
  STRAVA_REVOKED,
  STRAVA_UNREACHABLE,
  uploadToStrava,
  useStravaStatus,
} from "@/strava/connection";

/**
 * SEND ONE ACTIVITY TO STRAVA — the control, on the activity it sends.
 *
 * ── IT DOES NOT APPEAR FOR PEOPLE IT CANNOT WORK FOR ─────────────────────────
 *
 * No backend, signed out, still checking, or the status call failed: nothing
 * renders. That is this codebase's rule for integrations, written into the
 * devices screen the same way — "none of them are offered as a button that
 * would do nothing". A Strava button on a build with no server is a button that
 * fails after the tap, which is worse than one that was never there.
 *
 * It DOES appear when Strava is simply not connected yet, because that is a
 * state somebody can act on: the button becomes a link into the connect flow,
 * not a dead control.
 *
 * ── IT SENDS ONCE, THEN SAYS WHAT ACTUALLY HAPPENED ──────────────────────────
 *
 * Strava's upload endpoint is asynchronous. A success means QUEUED, not "on
 * your profile" — Strava can still reject it minutes later, most often as a
 * duplicate of the same outing recorded by a watch. So the finished state says
 * "Sent", the sentence underneath explains what Strava does next, and nothing
 * here ever claims the activity is live on a profile ICEFALL cannot see.
 *
 * ── THE UPLOAD IS NOT REMEMBERED, AND THE COPY IS HONEST ABOUT THAT ──────────
 *
 * ICEFALL stores no record that an activity was sent — nothing in
 * `RecordedActivity` holds it, and inventing a local flag would claim a state
 * the server never confirmed. Reopening this screen therefore offers the button
 * again. That is a real limitation rather than a hidden one: a second send
 * produces a duplicate that STRAVA rejects on its side, which the sentence
 * under the button says out loud so nobody is surprised by it.
 */
export function SendToStrava({ activity }: { activity: RecordedActivity }) {
  const status = useStravaStatus();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /* No server, no session, or no answer: this feature does not exist for this
     person right now, and half a control is worse than none. */
  if (status.state !== "connected" && status.state !== "not-connected") return null;

  /* A track produced by the labelled simulator would land on a public profile
     as a real ascent. It is refused in `uploadToStrava` as well; refusing to
     draw the button is the honest half of the same rule. */
  const usable = activity.points.filter((p) => !p.simulated).length >= 2;
  if (!usable) return null;

  async function send() {
    setBusy(true);
    setProblem(null);
    const res = await uploadToStrava(activity);
    setBusy(false);
    if (res.ok) {
      setDone(true);
      return;
    }
    setProblem(
      res.reason === "missing-scope"
        ? STRAVA_MISSING_SCOPE
        : res.reason === "revoked" || res.reason === "not-connected"
          ? STRAVA_REVOKED
          : res.reason === "no-track"
            ? STRAVA_NO_TRACK
            : res.reason === "rejected"
              ? "Strava refused this file. Nothing was added to your profile."
              : STRAVA_UNREACHABLE,
    );
  }

  /* FLAT — a row, not a card. The owner's standing rule (2026-09-06): the
     summary screen already carries its tiles, and one more outline here would
     be one more box competing with the recording it describes. */
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px]"
          style={{ background: "#FC4C02" }}
        >
          <Activity size={17} strokeWidth={2} className="text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] text-snow">{done ? "Sent to Strava" : "Send this to Strava"}</p>
          <p className="mt-0.5 text-[11.5px] text-mist-dim">
            {status.state === "connected"
              ? status.athleteUsername
                ? `@${status.athleteUsername}`
                : "Your connected account"
              : "Not connected yet"}
          </p>
        </div>

        {done ? (
          <Check size={18} strokeWidth={2} className="shrink-0 text-summit" />
        ) : status.state === "connected" && status.canUpload ? (
          <Button size="sm" disabled={busy} onClick={() => void send()}>
            {busy ? <Loader2 size={14} strokeWidth={2} className="animate-spin" /> : "Send"}
          </Button>
        ) : (
          /* Connected-but-unpermitted and not-connected both end at the same
             screen, because both are fixed the same way: run the consent flow
             again with the right box ticked. */
          <Button asChild size="sm" variant="secondary">
            <Link to="/settings/connections?from=/activity">
              {status.state === "connected" ? "Fix" : "Connect"}
            </Link>
          </Button>
        )}
      </div>

      {(done || problem) && (
        <p className="mt-3 text-[11.5px] leading-relaxed text-mist">{problem ?? STRAVA_QUEUED}</p>
      )}
    </div>
  );
}
