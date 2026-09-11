import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, HeartPulse, Loader2, TriangleAlert } from "lucide-react";

import { Rise } from "@/components/layout/chrome";
import { Button, SectionLabel } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  beginHealthConnect,
  disconnectHealth,
  finalizeHealthConnect,
  useHealthStatus,
  type HealthConnection,
  type HealthFinalizeOutcome,
} from "@/health/connections";
import { PolarCredit } from "@/health/PolarCredit";
import { HEALTH_VENDORS } from "@/health/vendors";
import {
  HEALTH_PROVIDERS,
  HEALTH_PROVIDER_NAME,
  type HealthProvider,
} from "@/health/types";

/**
 * HEALTH AND RECOVERY — Polar, WHOOP, Withings and Oura, on the Connected
 * accounts screen.
 *
 * ── WHAT THIS SECTION IS FOR ─────────────────────────────────────────────────
 *
 * Everything above it on this screen moves TRAINING around: an activity sent to
 * Strava, an outing brought back from a watch. These four move PHYSIOLOGY —
 * heart-rate variability, sleep stages, a recovery score, a body weight. That
 * is a different kind of thing to hand over, it needs its own explicit
 * permission, and it deserves to be described in the words of the actual
 * readings rather than as "health data".
 *
 * ── NOTHING HERE IS CONNECTED, AND THE SCREEN SAYS WHY, PER VENDOR ───────────
 *
 * ICEFALL holds no credentials for any of the four today, so every card should
 * read "Not set up" with the reason — except Oura, which reads "Not switched
 * on", because its reason is completely different and merging the two would
 * send somebody to register an app that must not be registered yet.
 *
 * NO DEAD BUTTONS ANYWHERE. A card with nothing to press shows a sentence
 * instead, the same rule the Strava and watch cards above already follow. A
 * greyed-out control under a row that already says "Not set up" says the same
 * thing twice and still invites the tap.
 */

/* -------------------------------------------------------------------------- */
/* The outcome a vendor redirected back with                                   */
/* -------------------------------------------------------------------------- */

type Outcome = { tone: "good" | "warn" | "plain"; title: string; body: string };

function isHealthProvider(v: string | null): v is HealthProvider {
  return !!v && (HEALTH_PROVIDERS as readonly string[]).includes(v);
}

/** `declined | expired | failed` — descriptions of the trip, taken from the
    address as-is, never a fact about whether anything is now connected. */
function outcomeForWord(word: string, name: string): Outcome | null {
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

/** One full sentence per refusal, and every one names what was NOT changed. */
function finalizeCopy(
  name: string,
): Record<Extract<HealthFinalizeOutcome, { ok: false }>["reason"], string> {
  return {
    "no-backend":
      "This build of ICEFALL runs without a server, so no account can be linked from it.",
    "signed-out": `You were signed out before ${name} sent you back, so this connection request could not be finished and cannot be resumed. Nothing was linked. Sign in and start the connection again.`,
    "not-saved": `${name} granted the permission, but ICEFALL could not save the connection. Nothing is linked here — start it again in a moment.`,
    /* Its own sentence, and it names the real cause. A connection that cannot
       be stored encrypted is not stored at all — WHOOP's terms require
       encryption at rest and ICEFALL applies that to all four — so this is an
       ICEFALL misconfiguration, and saying "try again" would send somebody to
       repeat something that will fail identically. */
    "not-encrypted": `${name} granted the permission, but ICEFALL could not store it safely and therefore did not store it at all. Nothing is linked here. This one is ours to fix, not yours.`,
    "consent-required":
      "Storing measurements like these needs your separate permission first, and it was not in place. Nothing was linked.",
    "not-available": `${name} cannot be connected from this build. Nothing was linked.`,
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

const connectedOutcome = (name: string): Outcome => ({
  tone: "good",
  title: `${name} connected`,
  body: `ICEFALL may now read the measurements listed on this card from your ${name} account, and nothing else.`,
});

const finishingOutcome = (name: string): Outcome => ({
  tone: "plain",
  title: "Finishing the connection…",
  body: `${name} sent you back. ICEFALL is confirming the link against your account.`,
});

/* -------------------------------------------------------------------------- */

export default function HealthAccounts() {
  const [params] = useSearchParams();
  const health = useHealthStatus();

  /*
   * READ ONCE, AT MOUNT, AND HELD — the same reason `Connections.tsx` gives
   * for its own arrival: the parent's effect strips these parameters from the
   * address, so reading them on every render would delete the banner's own
   * reason for existing one frame after it appeared.
   *
   * A child's `useState` initialiser runs during render, before any effect, so
   * this always sees the address the vendor sent us back to.
   */
  const [arrival] = useState(() => {
    const provider = params.get("provider");
    return {
      word: params.get("health") ?? "",
      provider: isHealthProvider(provider) ? provider : null,
      ticket: params.get("ticket") ?? "",
    };
  });
  const pending = arrival.word === "pending" && !!arrival.provider && !!arrival.ticket;

  const [outcomeByProvider, setOutcomeByProvider] = useState<
    Partial<Record<HealthProvider, Outcome>>
  >(() => {
    if (!arrival.provider) return {};
    const name = HEALTH_PROVIDER_NAME[arrival.provider];
    const initial = pending ? finishingOutcome(name) : outcomeForWord(arrival.word, name);
    return initial ? { [arrival.provider]: initial } : {};
  });
  const [finishingProvider, setFinishingProvider] = useState<HealthProvider | null>(
    pending ? arrival.provider : null,
  );

  /*
   * FINISH THE LINK, WITH THE SESSION THE CALLBACK DID NOT HAVE.
   *
   * The callback carries no ICEFALL session — it is the vendor's own redirect —
   * so the server parked the code under a one-time ticket and this is where it
   * is presented. "Connected" is drawn from the server's answer, never from a
   * word somebody could type into the address bar.
   */
  useEffect(() => {
    if (!pending || !arrival.ticket || !arrival.provider) return;
    const provider = arrival.provider;
    const name = HEALTH_PROVIDER_NAME[provider];
    let alive = true;
    void finalizeHealthConnect(arrival.ticket).then((res) => {
      if (!alive) return;
      if (res.ok) {
        const base = connectedOutcome(name);
        setOutcomeByProvider((prev) => ({
          ...prev,
          [provider]: res.deliveryOk
            ? base
            : {
                tone: "warn",
                title: `${name} connected, but not everything will reach ICEFALL`,
                /* Named, not generalised. Withings delivers by webhook and
                   subscribes one category at a time; saying "connected" over a
                   subscription that failed would promise readings that never
                   arrive. */
                body: `${name} is linked, but ICEFALL could not ask it to send: ${res.deliveryDetail ?? "some categories"}. Nothing from those will arrive. Disconnecting and connecting again is the fix.`,
              },
        }));
      } else {
        const copy = finalizeCopy(name);
        const body =
          (res.reason === "not-saved" || res.reason === "not-encrypted") && !res.revokedAtVendor
            ? `${copy[res.reason]} ${name} may still list ICEFALL as connected until you remove it there.`
            : copy[res.reason];
        setOutcomeByProvider((prev) => ({
          ...prev,
          [provider]: { tone: "warn", title: "Not connected", body },
        }));
      }
      setFinishingProvider(null);
      health.reload();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Rise className="pt-8">
        <SectionLabel>Health and recovery</SectionLabel>
        <p className="mt-2 text-[12px] leading-relaxed text-mist">
          Sleep, heart-rate variability and recovery from a ring, a band, a scale or a watch. These
          are measurements about your body, not your training, so they need your separate
          permission before anything is stored — and each card says exactly which readings it would
          take.
        </p>
        {health.consentMissing && (
          /* Said ONCE, above the cards, rather than four times inside them. The
             permission is one decision covering all of them, and repeating it
             per card would make it look like four. */
          <p className="mt-3 text-[12px] leading-relaxed text-mist">
            You have not given permission to store health measurements, so none of these can be
            connected yet. It is asked, in its own words, on{" "}
            <Link to="/settings/health-sources" className="text-azure underline underline-offset-2">
              Ring and health data
            </Link>
            .
          </p>
        )}
        <div className="mt-4 space-y-3">
          {HEALTH_PROVIDERS.map((provider) => (
            <HealthCard
              key={provider}
              connection={health.byProvider[provider]}
              outcome={outcomeByProvider[provider] ?? null}
              finishing={finishingProvider === provider}
              reload={health.reload}
            />
          ))}
        </div>
      </Rise>

      <Rise className="pt-6">
        <p className="text-[12px] leading-relaxed text-mist">
          Every sign-in happens on the vendor's own site — ICEFALL never sees those passwords, and
          the tokens it holds are stored encrypted on a server the app itself cannot read. A
          disconnect deletes the token here, whether or not the vendor confirms it at their end,
          and the card says which of the two happened.
        </p>
      </Rise>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* One vendor's card                                                          */
/* -------------------------------------------------------------------------- */

function HealthCard({
  connection,
  outcome,
  finishing,
  reload,
}: {
  connection: HealthConnection;
  outcome: Outcome | null;
  finishing: boolean;
  reload: () => void;
}) {
  const provider = connection.provider;
  const vendor = HEALTH_VENDORS[provider];
  const name = vendor.name;
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /*
   * SAID ONCE, NOT TWICE.
   *
   * A card can carry both an arrival banner and a ladder sentence, and on a
   * build with no server they are the same sentence — a trip that failed
   * because there is no server, above a card that cannot connect because there
   * is no server. Printing it twice makes it read like two separate faults.
   * Compared by value rather than by state, because the collision is between
   * two strings and not between two conditions.
   */
  const ladderSentence =
    connection.state === "signed-out"
      ? "Sign in to link a health account — the connection is stored against your account, not this device."
      : "This build of ICEFALL runs without a server, so no account can be linked from it.";
  const ladderRepeatsBanner = outcome?.body === ladderSentence;

  async function connect() {
    setBusy(true);
    setFailure(null);
    const res = await beginHealthConnect(provider, { returnTo: "/settings/connections" });
    if (res.ok) {
      /* A full navigation, not a new tab. The vendor's consent page is where
         somebody types their password and it must be in a real address bar
         they can inspect; a popup is blocked on most phone browsers anyway. */
      window.location.href = res.url;
      return;
    }
    setBusy(false);
    setFailure(
      res.reason === "signed-out"
        ? "Sign in first — the connection is stored against your account."
        : res.reason === "no-backend"
          ? "This build of ICEFALL has no server connection, so nothing can be linked."
          : res.reason === "consent-required"
            ? "Storing measurements like these needs your separate permission first. Nothing was changed."
            : res.reason === "not-available"
              ? (res.gateReason ?? `${name} cannot be connected from this build.`)
              : `ICEFALL could not reach ${name}. Nothing was changed.`,
    );
  }

  async function disconnect() {
    setBusy(true);
    setFailure(null);
    const res = await disconnectHealth(provider);
    setBusy(false);
    setConfirmOff(false);
    if (!res.ok) {
      setFailure("The connection could not be removed. Nothing was changed.");
      return;
    }
    /*
     * SAID ONLY WHEN IT IS TRUE. Deleting the token here and ending the grant
     * at the vendor are two different acts. Polar and Oura publish no way to
     * do the second, so this sentence is the normal outcome for them, not an
     * error — and it points people at the only place that can finish it.
     */
    if (!res.revokedAtVendor) {
      setFailure(
        `ICEFALL has deleted its copy of the connection, but could not confirm that with ${name}. Remove ICEFALL in your ${name} account settings to be certain.`,
      );
    }
    reload();
  }

  return (
    <div className="rounded-card border border-hairline bg-graphite p-4">
      <div className="flex items-start gap-3.5">
        {/* Neutral, like the watch tile beside it, and for the same reason:
            none of these four grants ICEFALL a mark, and Polar's agreement
            forbids its logo without written consent. One treatment, so no card
            looks more official than another. */}
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px]"
          style={{ background: "var(--ice-elevated)" }}
        >
          <HeartPulse size={19} strokeWidth={1.8} className="text-mist" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-snow">{name}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-mist-dim">{vendor.purpose}</p>
        </div>
        <HealthStatusMark connection={connection} />
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
              Account <span className="text-snow">{connection.accountLabel}</span>
            </p>
          ) : (
            /* The vendor did not say. Said so, rather than printing a
               placeholder where an identity would go. */
            <p className="text-mist-dim">
              {name} did not say which account this is. If you have more than one, check in the{" "}
              {name} app.
            </p>
          )}
          {connection.connectedAt && <p>Connected {fmtDate(connection.connectedAt)}</p>}
        </div>
      )}

      {/* THE CONTROL LADDER — no button where there is nothing to press. */}
      {finishing ? (
        <p className="mt-4 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
          Confirming the connection {name} just granted…
        </p>
      ) : connection.state === "legal-hold" ? (
        /* The server's own sentence, printed verbatim. There is one copy of
           this reason and it lives where the decision was made. */
        <p className="mt-4 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
          {connection.gateReason || vendor.obligation}
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
        ladderRepeatsBanner ? null : (
          <p className="mt-4 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
            {ladderSentence}
          </p>
        )
      ) : connection.state === "needs-credentials" ? (
        <p className="mt-4 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
          {vendor.needsCredentials}
        </p>
      ) : connection.state === "consent-required" ? (
        <p className="mt-4 border-t border-hairline pt-3.5 text-[11.5px] leading-relaxed text-mist-dim">
          Waiting on your permission to store health measurements — nothing can be connected until
          that is given, and it is asked on Ring and health data.
        </p>
      ) : connection.state === "connected" ? (
        <div className="mt-4 border-t border-hairline pt-3.5">
          <Button
            size="sm"
            variant={confirmOff ? "danger" : "secondary"}
            className="w-full"
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
        </div>
      ) : connection.state === "not-connected" ? (
        <div className="mt-4 border-t border-hairline pt-3.5">
          <Button
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => void connect()}
          >
            {busy ? (
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
            ) : (
              `Connect ${name}`
            )}
          </Button>
        </div>
      ) : null /* loading — the status mark is already a spinner */}

      {/* WHAT WOULD CROSS, IN THE WORDS OF THE ACTUAL READINGS.
          Named metrics, never "health data". Present on every card in every
          state, because somebody deciding whether to connect needs it BEFORE
          they connect, not after. */}
      <div className="mt-4 space-y-2 border-t border-hairline pt-3.5">
        <p className="text-[11px] uppercase tracking-[0.08em] text-mist-dim">
          What ICEFALL would read
        </p>
        <ul className="space-y-1">
          {vendor.reads.map((line) => (
            <li key={line} className="text-[12px] leading-relaxed text-mist">
              {line}
            </li>
          ))}
        </ul>
        <p className="pt-1.5 text-[11px] uppercase tracking-[0.08em] text-mist-dim">
          What ICEFALL would send
        </p>
        <p className="text-[12px] leading-relaxed text-mist">{vendor.sends}</p>

        {/* A CAPABILITY THE VENDOR DOES NOT HAVE IS NAMED, not left to be
            assumed. This is the honesty doctrine one level up from a reading:
            no screen is ever built implying WHOOP has a route or steps. */}
        {vendor.absent.length > 0 && (
          <>
            <p className="pt-1.5 text-[11px] uppercase tracking-[0.08em] text-mist-dim">
              What it would not
            </p>
            <ul className="space-y-1">
              {vendor.absent.map((line) => (
                <li key={line} className="text-[12px] leading-relaxed text-mist-dim">
                  {line}
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="pt-1.5 text-[11.5px] leading-relaxed text-mist-dim">{vendor.delivery}</p>
        {vendor.vendorCap && (
          <p className="text-[11.5px] leading-relaxed text-mist-dim">{vendor.vendorCap}</p>
        )}
        <p className="text-[11.5px] leading-relaxed text-mist-dim">{vendor.obligation}</p>

        {/* Polar's API agreement requires the literal text credit
            "Source: Polar" wherever Polar data appears. This card shows the
            account and connection date Polar supplied, so it carries one. */}
        {provider === "polar" && <PolarCredit className="block pt-0.5" />}
      </div>

      {failure && <p className="mt-3 text-[11.5px] leading-relaxed text-azure">{failure}</p>}
    </div>
  );
}

/**
 * The right-hand word, and every state it can honestly be.
 *
 * NINE STATES AND THEY NEVER MERGE. "Not connected" (nobody has linked this),
 * "Not set up" (ICEFALL holds no credentials), "Not switched on" (ICEFALL has
 * decided not to), "Needs permission" (the person has not agreed to store
 * measurements) and "Cannot be checked" (we asked and got no answer) are five
 * different facts with five different next steps. Collapsing any pair of them
 * into "Unavailable" would tell somebody to fix the wrong thing.
 */
function HealthStatusMark({ connection }: { connection: HealthConnection }) {
  const { state } = connection;

  if (state === "loading") {
    return (
      <Loader2 size={14} strokeWidth={2} className="mt-1 shrink-0 animate-spin text-mist-dim" />
    );
  }

  const label =
    state === "connected"
      ? "Connected"
      : state === "not-connected"
        ? "Not connected"
        : state === "signed-out"
          ? "Sign in first"
          : state === "no-backend"
            ? "Unavailable"
            : state === "unreachable"
              ? "Cannot be checked"
              : state === "needs-credentials"
                ? "Not set up"
                : state === "consent-required"
                  ? "Needs permission"
                  : "Not switched on"; // legal-hold

  return (
    <span
      className={cn(
        "mt-0.5 shrink-0 text-[11.5px]",
        state === "connected" ? "text-summit" : "text-mist-dim",
      )}
    >
      {label}
    </span>
  );
}
