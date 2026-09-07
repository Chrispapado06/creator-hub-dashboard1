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
import {
  beginWatchConnect,
  disconnectWatch,
  finalizeWatchConnect,
  importWatchActivities,
  useWatchStatus,
  type ImportFailure,
  type WatchConnection,
  type WatchFinalizeOutcome,
} from "@/watch/connection";
import { WATCH_PROVIDERS, WATCH_PROVIDER_NAME, type WatchProvider } from "@/watch/types";
import { WatchStatusMark, WatchTile } from "@/watch/WatchTile";

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
/* Watch accounts — the same doctrine, generalised to four vendors             */
/* -------------------------------------------------------------------------- */

function isWatchProvider(v: string | null): v is WatchProvider {
  return !!v && (WATCH_PROVIDERS as readonly string[]).includes(v);
}

/** `declined | expired | failed` — descriptions of the trip, taken from the
    address as-is, never a fact about whether anything is now connected. */
function watchOutcomeForWord(word: string, name: string): Outcome | null {
  switch (word) {
    case "declined":
      return {
        tone: "plain",
        title: "Not connected",
        body: `You cancelled on ${name}'s screen, so nothing was linked and nothing was shared.`,
      };
    case "expired":
      return {
        tone: "warn",
        title: "Connection request no longer valid",
        body: "Each request lasts ten minutes and can be used once. Start it again.",
      };
    case "failed":
      return {
        tone: "warn",
        title: `${name} did not complete the connection`,
        body: "Nothing was linked. This is usually temporary — try again, and if it keeps happening it is on our side rather than yours.",
      };
    default:
      return null;
  }
}

const watchConnectedOutcome = (name: string): Outcome => ({
  tone: "good",
  title: `${name} connected`,
  body: `ICEFALL can now bring across activities you record on your ${name} watch. Nothing arrives automatically — you choose when to check.`,
});

const watchPartialOutcome = (name: string): Outcome => ({
  tone: "warn",
  title: "Connected, but not permitted to read activities",
  body: `${name} is linked, but permission to read your activities was not granted, so nothing can be brought across. Connect again and leave that permission ticked.`,
});

const watchFinishingOutcome = (name: string): Outcome => ({
  tone: "plain",
  title: "Finishing the connection…",
  body: `${name} sent you back. ICEFALL is confirming the link against your account.`,
});

/** The eight sentences of `FINALIZE_COPY` (strava/connection.ts:277-295), with
    "{NAME}" substituted for "Strava". */
function watchFinalizeCopy(
  name: string,
): Record<Extract<WatchFinalizeOutcome, { ok: false }>["reason"], string> {
  return {
    "no-backend":
      "This build of ICEFALL runs without a server, so no account can be linked from it.",
    "signed-out": `You were signed out before ${name} sent you back, so this connection request could not be finished and cannot be resumed. Nothing was linked. Sign in and start the connection again.`,
    "not-saved": `${name} granted the permission, but ICEFALL could not save the connection. Nothing is linked here — start it again in a moment.`,
    "not-yours": `That ${name} consent was started from a different ICEFALL account, so it was not linked to this one. Nothing was stored. Start the connection again from here.`,
    invalid:
      "That connection request is no longer valid — each one can be used once. Start it again.",
    expired:
      "That connection request is no longer valid — each one lasts ten minutes. Start it again.",
    vendor: `${name} did not complete the connection. Nothing was linked — try again in a moment.`,
    unreachable:
      "ICEFALL could not finish the connection. Nothing was linked — try again in a moment.",
  };
}

/** One full sentence per import refusal, and every one names what was NOT
    changed — the same doctrine as `FINALIZE_COPY` above. */
const WATCH_IMPORT_COPY: Record<ImportFailure, (name: string) => string> = {
  "no-backend": () =>
    "This build of ICEFALL runs without a server, so nothing can be brought across.",
  "signed-out": () => "You are signed out. Sign in and try again — nothing was changed.",
  "not-connected": () => "That account is not connected any more. Nothing was brought across.",
  "not-available": () => "This connection is not available in this build. Nothing was changed.",
  revoked: (name) =>
    `${name} no longer accepts this connection — it was most likely removed from your ${name} account. Connect it again.`,
  "vendor-unreachable": (name) =>
    `ICEFALL could not reach ${name}. Nothing was brought across, and nothing was changed.`,
  "rate-limited": (name) =>
    `${name} is limiting how often ICEFALL may ask. Nothing was brought across — try again in a few minutes.`,
  "no-mapping": (name) =>
    `ICEFALL cannot yet read the shape of the data ${name} returned, so nothing was brought across. Nothing was changed.`,
  unreachable: () =>
    "ICEFALL could not finish. Nothing was brought across, and nothing was changed.",
};

/** The reason a card with no availability has no control at all — verbatim,
    keyed by the one vendor each currently applies to. */
const WATCH_REASON_SENTENCE: Partial<Record<WatchProvider, string>> = {
  polar:
    "ICEFALL has not registered with Polar yet, so there is nothing here to connect to. Polar issues credentials to anyone who asks — no approval, no fee — so this is waiting on ICEFALL rather than on Polar. The connection itself is built; it appears here the day the registration is done.",
  suunto:
    "ICEFALL is not approved by Suunto. Suunto only issues API access to partners it has accepted and who have signed its API agreement, and ICEFALL has not been through that. Until it has, there is nothing here to connect to.",
  garmin:
    "ICEFALL is not approved by Garmin, and Garmin has taken the application form off its site — email is the only way in at the moment. Garmin also only sends activities by pushing them to a web address it has approved, which ICEFALL does not run, so this is two things away rather than one. There is nothing here to connect to.",
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

  const watch = useWatchStatus();
  /* Same read-once-at-mount pattern as `arrival` above, generalised to the
     watch callback's three params. `watch` carries the outcome word,
     `provider` says which of the four vendors it is about, `ticket` is
     shared with Strava's own param name — the two never collide because only
     one vendor's callback lands on a given page load. */
  const [watchArrival] = useState(() => {
    const provider = params.get("provider");
    return {
      word: params.get("watch") ?? "",
      provider: isWatchProvider(provider) ? provider : null,
      ticket: params.get("ticket") ?? "",
    };
  });
  const watchPending =
    watchArrival.word === "pending" && !!watchArrival.provider && !!watchArrival.ticket;
  const [watchOutcomeByProvider, setWatchOutcomeByProvider] = useState<
    Partial<Record<WatchProvider, Outcome>>
  >(() => {
    if (!watchArrival.provider) return {};
    const name = WATCH_PROVIDER_NAME[watchArrival.provider];
    const initial = watchPending
      ? watchFinishingOutcome(name)
      : watchOutcomeForWord(watchArrival.word, name);
    return initial ? { [watchArrival.provider]: initial } : {};
  });
  /* Which single card, if any, is mid-finalize — the watch equivalent of
     `finishing` above, scoped to the one provider whose ticket this is. */
  const [finishingWatchProvider, setFinishingWatchProvider] = useState<WatchProvider | null>(
    watchPending ? watchArrival.provider : null,
  );

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
    if (
      !params.get("strava") &&
      !params.get("watch") &&
      !params.get("provider") &&
      !params.get("ticket")
    ) {
      return;
    }
    const next = new URLSearchParams(params);
    next.delete("strava");
    next.delete("watch");
    next.delete("provider");
    next.delete("ticket");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * FINISH THE WATCH LINK, WITH THE SESSION THE CALLBACK DID NOT HAVE.
   *
   * Same shape as the Strava effect below: the server answers with what it
   * actually wrote, and the card's banner is drawn from that answer alone.
   */
  useEffect(() => {
    if (!watchPending || !watchArrival.ticket || !watchArrival.provider) return;
    const provider = watchArrival.provider;
    const name = WATCH_PROVIDER_NAME[provider];
    let alive = true;
    void finalizeWatchConnect(watchArrival.ticket).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setWatchOutcomeByProvider((prev) => ({
          ...prev,
          [provider]: res.canImport ? watchConnectedOutcome(name) : watchPartialOutcome(name),
        }));
        /* COROS opens a deeper-history window for roughly 24 hours after
           authorization and never again without a reconnect — see
           `importWatchActivities`'s doc comment. Fired once, right here,
           immediately after a successful COROS finalize; not awaited, so a
           slow first import never delays the card from settling. */
        if (res.ok && provider === "coros") {
          void importWatchActivities("coros", { deep: true }).then(() => watch.reload());
        }
      } else {
        const copy = watchFinalizeCopy(name);
        const body =
          res.reason === "not-saved" && !res.revokedAtVendor
            ? `${copy[res.reason]} ${name} may still list ICEFALL as connected until you remove it there or connect again.`
            : copy[res.reason];
        setWatchOutcomeByProvider((prev) => ({
          ...prev,
          [provider]: { tone: "warn", title: "Not connected", body },
        }));
      }
      setFinishingWatchProvider(null);
      watch.reload();
    });
    return () => {
      alive = false;
    };
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

      {/*
        WATCH ACCOUNTS — the same doctrine as the Strava card above, generalised
        to four vendors. One box per provider (the same exception the owner's
        no-boxes rule leaves room for), in WATCH_PROVIDERS order: COROS first,
        because it is the one that works.
      */}
      <Rise className="pt-8">
        <SectionLabel>Watch accounts</SectionLabel>
        <div className="mt-3 space-y-3">
          {WATCH_PROVIDERS.map((provider) => (
            <WatchCard
              key={provider}
              connection={watch.byProvider[provider]}
              outcome={watchOutcomeByProvider[provider] ?? null}
              finishing={finishingWatchProvider === provider}
              reload={watch.reload}
            />
          ))}
        </div>
      </Rise>

      <Rise className="pt-7">
        <SectionLabel>What ICEFALL reads from a watch account</SectionLabel>
        <div className="mt-3 space-y-3.5">
          <Fact title="The summary of each activity">
            Start time, duration, distance, ascent and descent, heart rate and calories, as your
            watch service recorded them. ICEFALL does not recalculate any of it.
          </Fact>
          <Fact title="Which watch recorded it">
            So an imported activity says where it came from, everywhere it appears.
          </Fact>
          <Fact title="Nothing else">
            No sleep, no daily steps, no friends, no routes. And nothing arrives until you ask for
            it.
          </Fact>
        </div>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>What ICEFALL sends</SectionLabel>
        <div className="mt-3">
          <Fact title="Nothing">This connection only reads.</Fact>
        </div>
      </Rise>

      <Rise className="pt-6">
        <p className="text-[12px] leading-relaxed text-mist">
          Your watch sign-in happens on the watch service's own site. ICEFALL never sees that
          password, and the permission can be withdrawn from either end. An activity has to reach
          your watch service's cloud before ICEFALL can see it, so it appears here after your watch
          has synced, not the moment you stop recording.
        </p>
      </Rise>
    </SettingsPage>
  );
}

/* -------------------------------------------------------------------------- */
/* One watch provider's card                                                  */
/* -------------------------------------------------------------------------- */

function WatchCard({
  connection,
  outcome,
  finishing,
  reload,
}: {
  connection: WatchConnection;
  /** The arrival banner for THIS provider only — never another card's. */
  outcome: Outcome | null;
  /** True only while this provider's ticket is mid-finalize. */
  finishing: boolean;
  reload: () => void;
}) {
  const provider = connection.provider;
  const name = WATCH_PROVIDER_NAME[provider];
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function connect(region?: "eu" | "us") {
    setBusy(true);
    setFailure(null);
    setImportMsg(null);
    const res = await beginWatchConnect(provider, { returnTo: "/settings/connections", region });
    if (res.ok) {
      /* A full navigation, not a new tab — same reasoning as Strava's connect()
         above: the vendor's consent page will not render inside an iframe and a
         popup is blocked on most phone browsers. */
      window.location.href = res.url;
      return;
    }
    setBusy(false);
    setFailure(
      res.reason === "signed-out"
        ? "Sign in first — the connection is stored against your account."
        : res.reason === "no-backend"
          ? "This build of ICEFALL has no server connection, so nothing can be linked."
          : `ICEFALL could not reach ${name}. Nothing was changed.`,
    );
  }

  async function disconnect() {
    setBusy(true);
    setFailure(null);
    setImportMsg(null);
    const res = await disconnectWatch(provider);
    setBusy(false);
    setConfirmOff(false);
    if (!res.ok) {
      setFailure("The connection could not be removed. Nothing was changed.");
      return;
    }
    if (!res.revokedAtVendor) {
      setFailure(
        `ICEFALL has forgotten the connection, but could not confirm it with ${name}. Remove ICEFALL in your ${name} account settings to be certain.`,
      );
    }
    reload();
  }

  async function checkForActivities() {
    setBusy(true);
    setFailure(null);
    setImportMsg(null);
    const res = await importWatchActivities(provider);
    setBusy(false);
    if (!res.ok) {
      setFailure(WATCH_IMPORT_COPY[res.reason](name));
      return;
    }
    setImportMsg(
      res.imported > 0
        ? `Brought across ${res.imported} ${res.imported === 1 ? "activity" : "activities"} from ${name}. They appear in your history and count toward your training — not toward leaderboards.`
        : res.skipped > 0
          ? `Nothing new. ICEFALL already had every activity ${name} returned.`
          : `Nothing new since ${fmtDate(res.through)}.`,
    );
    reload();
  }

  return (
    <div className="rounded-card border border-hairline bg-graphite p-4">
      <div className="flex items-start gap-3.5">
        <WatchTile />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-snow">{name}</p>
        </div>
        <WatchStatusMark connection={connection} />
      </div>

      {outcome && (
        <div className="mt-4 border-t border-hairline pt-3.5">
          <p className="flex items-center gap-2 text-[13px] text-snow">
            {outcome.tone === "good" ? (
              <Check size={14} strokeWidth={2} className="shrink-0 text-summit" />
            ) : outcome.tone === "warn" ? (
              <TriangleAlert size={14} strokeWidth={1.8} className="shrink-0 text-azure" />
            ) : null}
            {outcome.title}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist">{outcome.body}</p>
        </div>
      )}

      {connection.state === "connected" && (
        <div className="mt-4 space-y-1.5 border-t border-hairline pt-3.5 text-[12px] text-mist">
          {connection.accountLabel ? (
            <p>
              Account <span className="text-snow">@{connection.accountLabel}</span>
            </p>
          ) : (
            <p className="text-mist-dim">
              {name} did not say which account this is. If you have more than one, check in the{" "}
              {name} app.
            </p>
          )}
          {connection.connectedAt && <p>Connected {fmtDate(connection.connectedAt)}</p>}
          <p>
            {connection.lastImportAt
              ? `Last checked ${fmtDate(connection.lastImportAt)}`
              : "Not checked yet"}
          </p>
          {!connection.canImport && (
            <p className="text-azure">
              Permission to read activities was not granted, so nothing can be brought across yet.
            </p>
          )}
          <p className="text-mist-dim">
            ICEFALL brings across each activity's summary — time, distance, ascent, heart rate. It
            does not bring the GPS track, so an imported activity draws no map and cannot be sent on
            to Strava.
          </p>
        </div>
      )}

      {/* THE CONTROL LADDER — no button where there is nothing to press. */}
      {finishing ? (
        <p className="mt-4 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
          Confirming the connection {name} just granted…
        </p>
      ) : connection.state === "unreachable" ? (
        <div className="mt-4 border-t border-hairline pt-3.5">
          <p className="text-[11.5px] leading-relaxed text-mist-dim">
            ICEFALL could not check whether {name} is already connected, so nothing is offered until
            it can.
          </p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={reload}>
            Check again
          </Button>
        </div>
      ) : connection.state === "no-backend" || connection.state === "signed-out" ? (
        <p className="mt-4 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
          {connection.state === "signed-out"
            ? "Sign in to link a watch account — the connection is stored against your account, not this device."
            : "This build of ICEFALL runs without a server, so no account can be linked from it."}
        </p>
      ) : connection.state === "not-built" ||
        connection.state === "vendor-approval-required" ||
        connection.state === "needs-registration" ? (
        <p className="mt-4 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
          {WATCH_REASON_SENTENCE[provider]}
        </p>
      ) : connection.state === "connected" ? (
        <div className="mt-4 flex gap-2 border-t border-hairline pt-3.5">
          <Button
            size="sm"
            className="flex-1"
            disabled={busy}
            onClick={() => void checkForActivities()}
          >
            {busy ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              "Check for new activities"
            )}
          </Button>
          <Button
            size="sm"
            variant={confirmOff ? "danger" : "secondary"}
            className="flex-1"
            disabled={busy}
            onClick={() => (confirmOff ? void disconnect() : setConfirmOff(true))}
          >
            {confirmOff ? "Tap again to disconnect" : "Disconnect"}
          </Button>
        </div>
      ) : provider === "coros" ? (
        <div className="mt-4 border-t border-hairline pt-3.5">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onClick={() => void connect("eu")}
            >
              Europe
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onClick={() => void connect("us")}
            >
              United States
            </Button>
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-mist-dim">
            COROS keeps accounts in a regional data centre, and the connection has to point at the
            right one. Pick where your COROS account is registered.
          </p>
        </div>
      ) : (
        <div className="mt-4 border-t border-hairline pt-3.5">
          <Button
            size="sm"
            className="w-full"
            disabled={busy || connection.state === "loading"}
            onClick={() => void connect()}
          >
            {busy ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              `Connect ${name}`
            )}
          </Button>
        </div>
      )}

      {importMsg && <p className="mt-3 text-[11.5px] leading-relaxed text-mist">{importMsg}</p>}
      {failure && <p className="mt-3 text-[11.5px] leading-relaxed text-azure">{failure}</p>}
    </div>
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
