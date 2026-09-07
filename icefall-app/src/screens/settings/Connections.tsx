import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, Check, Loader2, TriangleAlert } from "lucide-react";

import { Rise } from "@/components/layout/chrome";
import { SettingsPage } from "@/components/settings/kit";
import { Button, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  FINALIZE_COPY,
  beginStravaConnect,
  disconnectStrava,
  finalizeStravaConnect,
  useStravaStatus,
} from "@/strava/connection";

/**
 * CONNECTED ACCOUNTS — other services this account is linked to.
 *
 * A SEPARATE SCREEN FROM "DEVICES & APPS", AND NOT BY ACCIDENT. That page lists
 * watches and health stores — places training data is *measured*. Strava is
 * neither: it is another training app and a social network, and the owner had it
 * removed from that list on 2026-09-03 for exactly that reason ("listing it
 * invited 'ICEFALL will import my Strava history' when the page only ever meant
 * 'your watch could feed this'"). The note left behind said an account link
 * belongs wherever accounts are connected. This is that place.
 *
 * ── THE DIRECTION OF TRAVEL IS ONE WAY, AND THE SCREEN SAYS SO ───────────────
 *
 * ICEFALL sends activities TO Strava. It does not read anything back: no
 * history import, no follower sync, no segments. `activity:write` is the only
 * permission that does any work here, and a screen that said "Connected" beside
 * a Strava logo would let somebody assume their four years of Strava history
 * were about to appear in their ICEFALL passport. It says which way it goes.
 *
 * ── CONNECTED ≠ WORKING ──────────────────────────────────────────────────────
 *
 * Strava's consent screen has a tick box per permission, and people untick
 * things. An athlete can finish the flow, land back here, and have granted
 * everything EXCEPT the one permission the feature needs. That is the `partial`
 * outcome, and it gets its own state rather than being folded into "Connected"
 * — otherwise the first thing they learn is an upload failing for no stated
 * reason.
 */

/* -------------------------------------------------------------------------- */
/* The outcome Strava redirected back with                                     */
/* -------------------------------------------------------------------------- */

/**
 * The callback lands on `/settings/connections?strava=…`, which is the only way
 * this screen can know what happened — the consent flow leaves the app entirely,
 * so there is no promise to await and no state that survives it.
 *
 * TWO KINDS OF OUTCOME, AND THEY ARE NOT TREATED ALIKE. `declined`, `expired`
 * and `failed` describe the trip and are taken from the address as they are.
 * "Connected" is NOT — the callback never finishes a link; it parks the consent
 * under a one-time `ticket` and this screen asks the server to finish it (see
 * `finalizeStravaConnect`). So "connected" is drawn from the server's answer,
 * a measured fact, never from a word somebody could type into a URL.
 *
 * `declined` is NOT an error and is not styled as one. Pressing Cancel on a
 * permission screen is a decision, and an app that answers it with a red warning
 * is arguing with somebody who has already said no.
 */
type Outcome = { tone: "good" | "warn" | "plain"; title: string; body: string };

const OUTCOME: Record<string, Outcome> = {
  declined: {
    tone: "plain",
    title: "Not connected",
    body: "You cancelled on Strava's screen, so nothing was linked and nothing was shared.",
  },
  expired: {
    tone: "warn",
    title: "Connection request no longer valid",
    body: "Each request lasts ten minutes and can be used once. Start it again.",
  },
  failed: {
    tone: "warn",
    title: "Strava did not complete the connection",
    body: "Nothing was linked. This is usually temporary — try again, and if it keeps happening it is on our side rather than yours.",
  },
};

const CONNECTED: Outcome = {
  tone: "good",
  title: "Strava connected",
  body: "Activities you record in ICEFALL can now be sent to your Strava profile. Nothing is sent automatically — you choose, one activity at a time.",
};

const PARTIAL: Outcome = {
  tone: "warn",
  title: "Connected, but not permitted to add activities",
  body: "Strava is linked, but permission to add activities was not granted — it is the tick box on Strava's consent screen. Without it nothing can be sent. Connect again and leave that box ticked.",
};

const FINISHING: Outcome = {
  tone: "plain",
  title: "Finishing the connection…",
  body: "Strava sent you back. ICEFALL is confirming the link against your account.",
};

/* -------------------------------------------------------------------------- */

export default function Connections() {
  const [params, setParams] = useSearchParams();
  const status = useStravaStatus();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  /*
   * READ ONCE, AT MOUNT, AND HELD.
   *
   * It cannot be read from `params` on every render, because the effect below
   * removes the parameter — so the banner would draw for one frame and then
   * delete its own reason for existing. It flickered exactly that way the first
   * time it was wired up.
   */
  const [arrival] = useState(() => ({
    word: params.get("strava") ?? "",
    ticket: params.get("ticket") ?? "",
  }));
  const pending = arrival.word === "pending" && !!arrival.ticket;
  const [outcome, setOutcome] = useState<Outcome | null>(() =>
    pending ? FINISHING : (OUTCOME[arrival.word] ?? null),
  );
  /* True from mount until `finalize` has answered. While it is, the card offers
     nothing: the status row would otherwise read "Not connected" and offer a
     second connection on top of the one being finished. */
  const [finishing, setFinishing] = useState(pending);

  /*
   * The outcome is read once and then removed from the address.
   *
   * Leaving it there means the banner returns on every reload, and worse, it
   * survives a disconnect — so the screen would show "Strava connected" above a
   * row saying it is not. The status below is the truth; this banner only
   * explains the trip that just happened. The ticket goes too: it is single-use
   * and a reload must not present it twice.
   */
  useEffect(() => {
    if (!params.get("strava") && !params.get("ticket")) return;
    const next = new URLSearchParams(params);
    next.delete("strava");
    next.delete("ticket");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * FINISH THE LINK, WITH THE SESSION THE CALLBACK DID NOT HAVE.
   *
   * The server answers with what it actually wrote — including whether the
   * upload permission was granted — and the banner is drawn from that answer.
   * A refusal is shown in its own words; nothing here assumes success.
   */
  useEffect(() => {
    if (arrival.word !== "pending" || !arrival.ticket) return;
    let alive = true;
    void finalizeStravaConnect(arrival.ticket).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setOutcome(res.canUpload ? CONNECTED : PARTIAL);
      } else {
        const body =
          res.reason === "not-saved" && !res.revokedAtStrava
            ? `${FINALIZE_COPY[res.reason]} Strava still lists ICEFALL under Settings → My Apps until you remove it there or connect again.`
            : FINALIZE_COPY[res.reason];
        setOutcome({ tone: "warn", title: "Not connected", body });
      }
      /* `reload()` drops the status to loading first, so the button below is
         withheld until the re-measured answer lands. */
      setFinishing(false);
      status.reload();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect() {
    setBusy(true);
    setFailure(null);
    const res = await beginStravaConnect();
    if (res.ok) {
      /* A full navigation, not a new tab. Strava's consent page will not render
         inside an iframe and a popup is blocked on most phone browsers; the
         athlete comes back to this same screen with `?strava=…`. */
      window.location.href = res.url;
      return;
    }
    setBusy(false);
    setFailure(
      res.reason === "signed-out"
        ? "Sign in first — the connection is stored against your account."
        : res.reason === "no-backend"
          ? "This build of ICEFALL has no server connection, so nothing can be linked."
          : "ICEFALL could not reach Strava. Nothing was changed.",
    );
  }

  async function disconnect() {
    setBusy(true);
    setFailure(null);
    const res = await disconnectStrava();
    setBusy(false);
    setConfirmOff(false);
    if (!res.ok) {
      setFailure("The connection could not be removed. Nothing was changed.");
      return;
    }
    /*
     * SAID ONLY WHEN IT IS TRUE. Deleting our row and deauthorising at Strava
     * are two different acts, and only the second one actually ends Strava's
     * side of it. When the deauthorise did not happen, the screen sends people
     * to Strava's own settings rather than implying it is finished.
     */
    if (!res.revokedAtStrava) {
      setFailure(
        "ICEFALL has forgotten the connection, but could not confirm it with Strava. Remove ICEFALL under Settings → My Apps on Strava to be certain.",
      );
    }
    status.reload();
  }

  return (
    <SettingsPage title="Connected accounts" subtitle="Other services linked to this account.">
      {/* FLAT, not a tinted card. The owner's standing rule, 2026-09-06: a status
          message is a sentence, not a box. The tone is carried by one small icon
          and nothing else. */}
      {outcome && (
        <Rise>
          <div className="pb-1">
            <p className="flex items-center gap-2 text-[14px] text-snow">
              {outcome.tone === "good" ? (
                <Check size={15} strokeWidth={2} className="shrink-0 text-summit" />
              ) : outcome.tone === "warn" ? (
                <TriangleAlert size={15} strokeWidth={1.8} className="shrink-0 text-azure" />
              ) : null}
              {outcome.title}
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-mist">{outcome.body}</p>
          </div>
        </Rise>
      )}

      {/*
        THE ONE BOX ON THIS SCREEN, AND IT EARNS IT.
        A connected third-party account IS a distinct object with its own state
        and its own controls — the exception the owner's rule leaves room for.
        Everything below it is flat.
      */}
      <Rise className={outcome ? "pt-5" : undefined}>
        <div className="rounded-card border border-hairline bg-graphite p-4">
          <div className="flex items-start gap-3.5">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px]"
              style={{ background: "#FC4C02" }}
            >
              <Activity size={19} strokeWidth={2} className="text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] text-snow">Strava</p>
              <p className="mt-1 text-[12px] leading-relaxed text-mist-dim">
                Send an activity you recorded here to your Strava profile.
              </p>
            </div>
            <StatusMark status={status} />
          </div>

          {status.state === "connected" && (
            <div className="mt-4 space-y-1.5 border-t border-hairline pt-3.5 text-[12px] text-mist">
              {/* Which account — people have more than one, and the wrong one is
                  otherwise invisible until an activity turns up on it. */}
              {status.athleteUsername ? (
                <p>
                  Athlete <span className="text-snow">@{status.athleteUsername}</span>
                </p>
              ) : status.athleteId !== null ? (
                <p>
                  Athlete <span className="text-snow">#{status.athleteId}</span>
                </p>
              ) : (
                /* Strava did not say. Said so, rather than printing a placeholder
                   where an identity would go. */
                <p className="text-mist-dim">
                  Strava did not say which athlete this is — check under Settings → My Apps on
                  Strava if you have more than one account.
                </p>
              )}
              {status.connectedAt && <p>Connected {fmtDate(status.connectedAt)}</p>}
              {!status.canUpload && (
                <p className="text-azure">
                  Permission to add activities was not granted, so nothing can be sent yet.
                </p>
              )}
            </div>
          )}

          {/*
           * NO BUTTON WHERE THERE IS NOTHING TO PRESS.
           *
           * A build with no server, or nobody signed in, cannot connect
           * anything — and this codebase's rule for that is already written on
           * the devices screen: "none of them are offered as a button that
           * would do nothing". A greyed-out control under a row that already
           * reads "Unavailable" says the same thing twice and still invites the
           * tap. One sentence replaces it.
           */}
          {finishing ? (
            <p className="mt-4 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
              Confirming the connection Strava just granted…
            </p>
          ) : status.state === "unreachable" ? (
            /* "Cannot be checked" is not "not connected": offering a connect
               button here would invite a second link on top of one that may
               already exist. A re-check is the one control that is honest. */
            <div className="mt-4 border-t border-hairline pt-3.5">
              <p className="text-[11.5px] leading-relaxed text-mist-dim">
                ICEFALL could not check whether Strava is already connected, so nothing is offered
                until it can.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => status.reload()}
              >
                Check again
              </Button>
            </div>
          ) : status.state === "no-backend" || status.state === "signed-out" ? (
            <p className="mt-4 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
              {status.state === "signed-out"
                ? "Sign in to link a Strava account — the connection is stored against your account, not this device."
                : "This build of ICEFALL runs without a server, so no account can be linked from it."}
            </p>
          ) : (
            <div className="mt-4 flex gap-2">
              {status.state === "connected" ? (
                <>
                  {!status.canUpload && (
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => void connect()}
                    >
                      Fix permissions
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={confirmOff ? "danger" : "secondary"}
                    className="flex-1"
                    disabled={busy}
                    onClick={() => (confirmOff ? void disconnect() : setConfirmOff(true))}
                  >
                    {busy ? (
                      <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                    ) : confirmOff ? (
                      "Tap again to disconnect"
                    ) : (
                      "Disconnect"
                    )}
                  </Button>
                </>
              ) : (
                /*
                 * STRAVA'S OWN BUTTON GOES HERE.
                 *
                 * Their brand guidelines require the supplied "Connect with
                 * Strava" image asset rather than a re-drawn one, and it is not
                 * bundled with this app — so this is their orange and their
                 * wording on our button shape, and swapping in the official PNG
                 * is a drop-in replacement for this element and nothing else.
                 */
                <Button
                  size="sm"
                  className="flex-1 text-white hover:brightness-110"
                  style={{ background: "#FC4C02" }}
                  disabled={busy || status.state === "loading"}
                  onClick={() => void connect()}
                >
                  {busy ? (
                    <Loader2 size={14} strokeWidth={2} className="animate-spin" />
                  ) : (
                    "Connect with Strava"
                  )}
                </Button>
              )}
            </div>
          )}

          {failure && <p className="mt-3 text-[11.5px] leading-relaxed text-azure">{failure}</p>}
        </div>
      </Rise>

      {/* WHAT CROSSES, IN THE WORDS OF WHAT IS ACTUALLY IN THE REQUEST.
          Not a privacy paragraph — the fields the upload sends, as plain rows. */}
      <Rise className="pt-7">
        <SectionLabel>What ICEFALL sends</SectionLabel>
        <div className="mt-3 space-y-3.5">
          <Fact title="Your recorded track">
            The GPS points of the activity you choose to send: position, elevation and time. Strava
            works out distance and ascent from them itself.
          </Fact>
          <Fact title="The activity's title and type">
            So it arrives named the way you named it here.
          </Fact>
          <Fact title="Nothing else, and nothing automatically">
            No estimates, no readiness figures, no profile details — and no activity leaves ICEFALL
            unless you send it.
          </Fact>
        </div>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>What ICEFALL reads back</SectionLabel>
        <div className="mt-3">
          <Fact title="Nothing">
            Your Strava history, followers and segments are not imported. This connection only
            sends.
          </Fact>
        </div>
      </Rise>

      <Rise className="pt-6">
        <p className="text-[12px] leading-relaxed text-mist">
          Your Strava sign-in happens on Strava's own site. ICEFALL never sees your Strava password,
          and the permission it holds can be withdrawn from either end — here, or under Settings →
          My Apps on Strava.
        </p>
      </Rise>

      <Rise className="pt-5">
        <Disclaimer>
          Strava processes uploads in the background: a sent activity appears on your profile
          shortly afterwards, and Strava rejects it there as a duplicate if your watch already
          recorded the same outing. Powered by Strava.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}

/** One stated fact: a title and a sentence, aligned by spacing rather than a box. */
function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13.5px] text-snow">{title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-mist-dim">{children}</p>
    </div>
  );
}

/**
 * The right-hand word, and every state it can honestly be.
 *
 * "Not connected" and "cannot be checked" are different facts and are never
 * merged: the first is a settled state somebody can act on, the second means we
 * asked and did not get an answer, where showing "Not connected" would invite a
 * second connection on top of one that may already exist.
 */
function StatusMark({ status }: { status: ReturnType<typeof useStravaStatus> }) {
  const label =
    status.state === "loading"
      ? null
      : status.state === "connected"
        ? status.canUpload
          ? "Connected"
          : "Needs permission"
        : status.state === "not-connected"
          ? "Not connected"
          : status.state === "signed-out"
            ? "Sign in first"
            : status.state === "no-backend"
              ? "Unavailable"
              : "Cannot be checked";

  if (label === null) {
    return (
      <Loader2 size={14} strokeWidth={2} className="mt-1 shrink-0 animate-spin text-mist-dim" />
    );
  }

  return (
    <span
      className={cn(
        "mt-0.5 shrink-0 text-[11.5px]",
        status.state === "connected" && status.canUpload ? "text-summit" : "text-mist-dim",
      )}
    >
      {label}
    </span>
  );
}
