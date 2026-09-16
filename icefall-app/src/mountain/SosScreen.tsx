/**
 * SOS (brief M6, plan §3.6 and §5; REDRAWN to mockup 2, spec §5).
 *
 * THE SHAPE THE OWNER'S MOCKUP FIXES, top to bottom: a red EMERGENCY bar with a
 * close, the filled-red CALL button carrying the real dialable number and the
 * countries it covers, YOUR POSITION over huge two-line coordinates with an
 * azure-outline COPY beside them, the DMS/accuracy/time sub-line, the azure
 * outline SEND SMS button, WHAT TO SAY, then MY EMERGENCY INFO.
 *
 * The call button moved ABOVE the position block for this redraw. The plan's
 * earlier order put the coordinates first; the mockup puts the one thing you
 * press first, and everything the old order carried is still on the screen in
 * the same words, one scroll below.
 *
 * Zero network and zero AI: the numbers come from `data/mountainRescue.ts`
 * through `emergencyNumbers.ts` (neither reaches anything that can fail), the
 * position from GPS and the last saved fix, the rest from this phone's storage.
 *
 * THE NUMBERS THEMSELVES ARE NEVER GREYED (plan §5.4). Everywhere else in
 * Mountain mode old safety data is dimmed and labelled; here the digits stay at
 * full contrast and the call button never disables, because a greyed number is
 * worse at the bad moment than an old one that is very probably still right.
 * The age line under each number carries the staleness instead.
 *
 * THE POSITION IS THE ONE THING ON THIS SCREEN THAT DOES GREY (spec §5, stale
 * variant), because an old fix is not where you are: the label turns amber and
 * reads "Last known", the coordinates render grey instead of white, and an amber
 * "Recorded N min ago" sits directly under them. That is the honesty rule made
 * visual, and it is the whole difference between the two mockup states.
 */

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";

import { mountainById } from "@/data/mock/mountains";
import { cn } from "@/lib/utils";
import { useReportMountainRuntime } from "@/settings/useMountainSettings";
import { useScreenWakeLock } from "@/tracking/wakeLock";

import { useBattery } from "./battery";
import { matchDestination, type DestinationMatch } from "./destinationCountry";
import EmergencyInfoSection from "./EmergencyInfoSection";
import { useEmergencyInfo } from "./emergencyInfo";
import {
  INTERNATIONAL_112,
  INTERNATIONAL_112_NOTE,
  NO_NUMBER_HEADING,
  resolveEmergency,
  type EmergencyResolution,
  type ResolvedNumber,
} from "./emergencyNumbers";
import { ageLabel } from "./format";
import { MOUNTAIN_PATHS } from "./paths";
import { positionFreshness, useLastKnownPosition, useLivePosition, type KnownPosition } from "./position";
import {
  SMS_HONESTY,
  accuracyLabel,
  formatDDM,
  formatDMS,
  formatDecimal,
  fullDateTime,
  isIosUserAgent,
  metresLabel,
  positionCopyText,
  smsBody,
  smsHref,
  telHref,
} from "./sos";
import { useMountainTrip } from "./trip";
import { SectionLabel, buttonClass } from "./ui";

/** Grey sub-line: a note under a button, a caveat under a number. */
const SUB = "text-[15px] leading-snug text-mist";
/** A plain white sentence at reading size. */
const SAY = "text-[17px] leading-snug text-snow";
/** Plan §3.6: prompt to write the position down below this battery level. */
const LOW_BATTERY_PERCENT = 15;
const NO_SIGNAL_NO_CALL =
  "If this phone has no mobile signal the call will not connect. The number is written out above so it can be dialled from another phone or a radio.";

/**
 * "France / Italy" reads as a filename on a button. The mockup writes the
 * countries as a sentence, so the separator becomes a word. Nothing is added:
 * the names are exactly the ones the dataset resolved.
 */
function naturalJoin(label: string | null): string | null {
  if (!label) return null;
  const parts = label
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export default function SosScreen() {
  const now = useNow();
  /* The battery saver stands aside while this screen is open, and says so on
     its own settings row rather than quietly claiming to be saving power. The
     GPS half is already settled by the "sos" purpose below; this is what makes
     the SETTING honest about it. */
  useReportMountainRuntime({ onSos: true });
  /* "sos": full GPS accuracy whatever the battery saver says (plan §6.2). */
  const live = useLivePosition(true, "sos");
  const last = useLastKnownPosition();
  const wake = useScreenWakeLock(true);
  const battery = useBattery();
  const { trip, runningToday } = useMountainTrip();
  const info = useEmergencyInfo();

  const position = live.fix ?? last;
  const mountain = trip?.mountainId ? mountainById(trip.mountainId) : undefined;
  const placeName = trip?.peakName ?? mountain?.name ?? null;
  const today = isoDate(now);
  /* The country is the trip's mountain, or the destination the athlete typed —
     never the position. ICEFALL holds no borders, and a fix forty kilometres
     from Mont Blanc could be in any of three countries (plan §5.6). */
  const destination = matchDestination(info?.destinationCountry);
  const em = resolveEmergency({
    mountainId: trip?.mountainId,
    countryCode: destination.state === "held" || destination.state === "gap" ? destination.code : null,
    today,
  });
  const primaryIndex = em.numbers.findIndex((n) => n.tel);
  const primary = primaryIndex >= 0 ? em.numbers[primaryIndex] : null;
  const others = em.numbers.filter((_, i) => i !== primaryIndex);

  return (
    <div className="pb-10">
      <EmergencyBar />

      {/* THE HERO: one red rectangle with the real number on it. Warnings are
          read above it, never on a row below (plan §5.9). */}
      <section aria-labelledby="call-heading" className="px-5 pt-5">
        <h2 id="call-heading" className="sr-only">
          Emergency call
        </h2>

        {em.warnings.map((w) => (
          <p key={w} className="mb-3 text-[17px] leading-snug text-alert" role="note">
            {w}
          </p>
        ))}

        {primary ? (
          <>
            <CallButton n={primary} covers={naturalJoin(em.countryLabel)} />
            <p className={`${SUB} mt-2`}>{primary.entry.label}</p>
            {/* WHAT STAYS UNDER THE BUTTON, AND WHY. The mockup draws nothing
                between CALL and YOUR POSITION. Only two things earn the space:
                a number old enough to be doubted (amber, so it is read before
                it is dialled), and the sentence about having no signal, which
                is the one paragraph here that is actionable on a mountain —
                dial it from someone else's phone or a radio. The source and
                the read-on date are provenance, not instructions: they moved
                to the foot of this screen, in full, with the rest. */}
            {primary.age.loud && <AgeLine n={primary} warnings={em.warnings} />}
            <p className={`${SUB} mt-2`}>{NO_SIGNAL_NO_CALL}</p>
          </>
        ) : em.numbers.length > 0 ? (
          <p className={SAY}>
            Nothing ICEFALL holds for here is a phone number. What there is, is listed below.
          </p>
        ) : (
          <>
            <a
              href={`tel:${INTERNATIONAL_112}`}
              className={cn(buttonClass("red"), "flex-col gap-1 py-3")}
              aria-label={`Call ${INTERNATIONAL_112}`}
            >
              <span className={CALL_DIGITS} style={CALL_STYLE}>
                Call {INTERNATIONAL_112}
              </span>
              <span className={CALL_SUB}>International emergency number</span>
            </a>
            <p className="mt-3 text-[19px] font-medium leading-snug text-snow">{NO_NUMBER_HEADING}</p>
            {INTERNATIONAL_112_NOTE.map((p) => (
              <p key={p} className={`${SAY} mt-3`}>
                {p}
              </p>
            ))}
            <p className={`${SUB} mt-3`}>{NO_SIGNAL_NO_CALL}</p>
          </>
        )}
      </section>

      {/* THE MOCKUP'S ORDER (spec §5), AND IT IS A SAFETY ORDER, NOT A TASTE ONE.
          Call, then the position you read out, then the SMS, then what to say.
          Until 16 Sep the position sat SIXTH, under five paragraphs of sourcing
          prose — six screens of scrolling to reach the one thing rescue asks
          for first. Nothing was deleted to fix that: every word of provenance
          is still on this screen, below, where it belongs. Do not move the
          position back down. */}
      <PositionBlock
        position={position}
        live={live}
        now={now}
        batteryPercent={battery && !battery.charging ? battery.percent : null}
      />

      <TextMessageRow position={position} placeName={placeName} contacts={info?.contacts ?? []} />

      <section aria-labelledby="say-heading" className="mt-9 px-5">
        <SectionLabel as="h2" id="say-heading">
          What to say
        </SectionLabel>
        <p className="mt-3 text-[22px] leading-snug text-snow">Where you are</p>
        <p className="mt-2 text-[22px] leading-snug text-snow">What happened</p>
        <p className="mt-2 text-[22px] leading-snug text-snow">How many people</p>
        <p className={`${SUB} mt-3`}>
          Read your position out before you dial — you will not see it during the call.
        </p>
      </section>

      {/* The other numbers stay ABOVE the athlete's own stored details: these
          are things to dial, those are things to read out. */}
      {em.numbers.length > 0 && (
        <ul className="mt-9">
          {others.map((n) => (
            <NumberRow key={`${n.entry.number}-${n.entry.label}`} n={n} warnings={em.warnings} />
          ))}
          {em.show112 && (
            <li className="border-t border-hairline px-5 py-3">
              <a href={`tel:${INTERNATIONAL_112}`} className={ROW_INNER}>
                <span className="min-w-0 text-[17px]">International emergency number · last resort</span>
                <span className="font-medium tabular-nums underline" style={ROW_NUMBER_STYLE}>
                  {INTERNATIONAL_112}
                </span>
              </a>
              <p className={SUB}>{INTERNATIONAL_112_NOTE[1]}</p>
            </li>
          )}
        </ul>
      )}

      <EmergencyInfoSection info={info} />

      {/* Where these numbers came from, so a wrong match is visible (plan §5.6),
          and what is missing. Kept in full, read last. */}
      <WhichNumbers
        em={em}
        tripName={trip?.name ?? null}
        placeName={placeName}
        runningToday={runningToday}
        notice={trip?.notice ?? null}
        destination={destination}
      />

      {/* The call button's own source and read-on date, moved down from under
          the button. Named with its number, so it is never ambiguous which
          number the sourcing belongs to. A number old enough to be doubted is
          NOT here — that stays up beside the button, in amber. */}
      {primary && !primary.age.loud && (
        <div className="mt-4 px-5">
          <p className={SUB}>
            {primary.entry.number} · {primary.entry.label}
          </p>
          <AgeLine n={primary} warnings={em.warnings} />
        </div>
      )}

      <WhatIsNotHeld em={em} />

      {wake.sentence && <p className={`${SUB} mt-8 border-t border-hairline px-5 pt-3`}>{wake.sentence}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The red bar that replaces the header (spec §5)                              */
/* -------------------------------------------------------------------------- */

/**
 * Sticky, so the way out of the emergency screen is always one tap away however
 * far down the numbers you have scrolled. Closing goes back where you came from;
 * opened cold from a link, there is nothing to go back to, so it lands on the
 * mode's own front door rather than leaving the app.
 */
function EmergencyBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const close = () => {
    if (location.key === "default") navigate(MOUNTAIN_PATHS.root, { replace: true });
    else navigate(-1);
  };
  return (
    <div
      className="sticky top-0 z-20 flex min-h-16 items-center"
      /* This bar stands in for the shell's header, so it carries the notch.
         The vivid emergency fill, not the ink red — see mountainTheme.css. */
      style={{
        backgroundColor: "var(--ice-danger-fill, #d92b1f)",
        color: "var(--ice-on-accent)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <span aria-hidden className="h-16 w-16 shrink-0" />
      <h1 className="flex-1 text-center text-[17px] font-bold uppercase tracking-[0.2em]">Emergency</h1>
      <button
        type="button"
        onClick={close}
        aria-label="Close the emergency screen"
        className="grid h-16 w-16 shrink-0 place-items-center"
      >
        <X size={26} strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Position                                                                    */
/* -------------------------------------------------------------------------- */

/** The two-line coordinates. Big, but sized off the viewport so twelve
    characters and the COPY button still share one line on a 320 px phone. */
const COORD_STYLE = {
  fontSize: "clamp(30px, calc(8.8vw * var(--mountain-number-scale, 1)), calc(38px * var(--mountain-number-scale, 1)))",
} as const;

/**
 * The big line on the red button. Sized off the viewport for the same reason as
 * the coordinates: every number the data holds today is a short code, but a
 * long international one added later must not push the button off the screen.
 */
const CALL_STYLE = {
  fontSize: "clamp(24px, calc(7.4vw * var(--mountain-number-scale, 1)), calc(32px * var(--mountain-number-scale, 1)))",
} as const;

function PositionBlock({
  position,
  live,
  now,
  batteryPercent,
}: {
  position: KnownPosition | null;
  live: ReturnType<typeof useLivePosition>;
  now: number;
  batteryPercent: number | null;
}) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const searching = live.status === "searching" || (live.status === "live" && !live.fix);
  const elapsedS = live.startedAt ? Math.max(0, Math.floor((now - live.startedAt) / 1000)) : 0;
  const lowBattery = batteryPercent !== null && batteryPercent < LOW_BATTERY_PERCENT;

  const statusLine =
    live.status === "denied"
      ? "Location is off for ICEFALL. Turn it on in your phone's settings to get a new position."
      : live.status === "unsupported"
        ? "This browser cannot read GPS."
        : live.status === "error" && !live.fix
          ? "Your phone has not given a GPS position."
          : searching
            ? `Finding satellites · ${elapsedS} s. This can take a long time with no signal, and it can fail under a face or in a valley.`
            : null;

  /* THE SLOT KEEPS ITS SHAPE with no fix: same label, same place, honest words
     where the coordinates would be — it never collapses (spec §0 honesty). */
  if (!position) {
    return (
      <section aria-labelledby="pos-heading" className="mt-9 px-5">
        <SectionLabel as="h2" id="pos-heading">
          Your position
        </SectionLabel>
        <p className="mt-2 font-light leading-[1.05] text-mist" style={COORD_STYLE}>
          No position yet
        </p>
        {statusLine && <p className={`${SAY} mt-3`}>{statusLine}</p>}
        <p className={`${SAY} mt-3`}>
          Until one arrives, say where you are in words: the route, the last hut or camp you passed, and roughly how
          high.
        </p>
      </section>
    );
  }

  const freshness = positionFreshness(position, now);
  const current = freshness === "fresh" || freshness === "aged";
  const acc = accuracyLabel(position.accuracyM);
  const altAcc = accuracyLabel(position.altitudeAccuracyM);
  const sameDay = isoDate(position.at) === isoDate(now);

  const doCopy = async () => {
    const ok = await copyText(positionCopyText(position));
    setCopy(ok ? "copied" : "failed");
  };

  return (
    <section aria-labelledby="pos-heading" className="mt-9 px-5">
      {/* STALE: the label turns amber and renames itself. */}
      <SectionLabel as="h2" id="pos-heading" tone={current ? "mist" : "alert"}>
        {current ? "Your position" : "Last known"}
      </SectionLabel>

      <div className="mt-2 flex items-center justify-between gap-3">
        <p
          className={cn("min-w-0 font-light leading-[1.1] tabular-nums", current ? "text-snow" : "text-mist")}
          style={COORD_STYLE}
        >
          <span className="block whitespace-nowrap">{formatDecimal(position.lat, "lat")}</span>
          <span className="block whitespace-nowrap">{formatDecimal(position.lon, "lon")}</span>
        </p>
        <button type="button" onClick={doCopy} className={cn(buttonClass("azure-outline", "sm"), "shrink-0")}>
          {copy === "copied" ? "Copied" : "Copy"}
        </button>
      </div>

      {/* STALE: an amber age line sits directly under the coordinates. */}
      {!current && (
        <p className="mt-2 text-[17px] font-medium text-alert">Recorded {ageLabel(now - position.at)}</p>
      )}

      <p className={`${SUB} mt-2 tabular-nums`}>
        {formatDMS(position.lat, "lat")} {formatDMS(position.lon, "lon")}
        {" · "}
        {acc ? `GPS ${acc}` : "GPS accuracy not given"}
        {" · "}
        {sameDay ? shortTime(position.at) : fullDateTime(position.at)}
      </p>
      <p className={`${SUB} mt-1 tabular-nums`}>
        {position.altitudeM !== null
          ? `Altitude ${metresLabel(position.altitudeM)}${altAcc ? ` ${altAcc}` : " · error not given"}`
          : "No altitude from your phone"}
      </p>
      {statusLine && <p className={`${SAY} mt-2`}>{statusLine}</p>}
      {copy === "failed" && (
        <p className="mt-2 text-[17px] text-alert" role="alert">
          Could not copy. Write them down.
        </p>
      )}

      <div className="mt-5 border-t border-hairline pt-3">
        <SectionLabel tone={lowBattery ? "alert" : "mist"}>
          {lowBattery ? `Write these down now · battery ${batteryPercent}%` : "Write these down"}
        </SectionLabel>
        <p className="mt-2 text-[22px] leading-snug tabular-nums text-snow">
          {formatDDM(position.lat, "lat")}
          <br />
          {formatDDM(position.lon, "lon")}
        </p>
        <p className={`${SUB} mt-1`}>Paper still works when the phone is flat.</p>
      </div>
    </section>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the old way */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Numbers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Which numbers these are and where they came from, so a wrong match is visible
 * rather than silent (plan §5.6). Quiet grey under the button it explains.
 */
function WhichNumbers({
  em,
  tripName,
  placeName,
  runningToday,
  notice,
  destination,
}: {
  em: EmergencyResolution;
  tripName: string | null;
  placeName: string | null;
  runningToday: boolean;
  notice: string | null;
  destination: DestinationMatch;
}) {
  const countryName = em.countryLabel;
  let line: string;
  if (em.via === "mountain") {
    const where = placeName ?? "your mountain";
    line = `For ${where}${countryName ? ` (${countryName})` : ""}, from ${runningToday ? "your trip" : `${tripName ?? "your trip"}, which is not running today`}.`;
  } else if (em.via === "country" && countryName) {
    line = `For ${countryName}, the destination you set. ICEFALL does not know which mountain you are on.`;
  } else if (tripName) {
    line = `Your trip ${tripName} is not on a mountain ICEFALL holds numbers for.`;
  } else {
    line = "No trip on this phone, so ICEFALL cannot tell which mountain you are on.";
  }

  return (
    /* Read last, so it is separated by a hairline and set at sub-line weight —
       provenance, not an instruction. */
    <div className="mt-9 border-t border-hairline px-5 pt-4">
      <p className={SUB}>{line}</p>
      {em.via !== "country" && destination.state === "unknown" && (
        <p className={`${SUB} mt-1`}>
          You set “{destination.typed}” as your destination. ICEFALL holds no numbers under that name.
        </p>
      )}
      {em.gap && (
        <p className={`${SAY} mt-3`} role="note">
          {em.gap.reason}
        </p>
      )}
      {em.review && <p className={`${SUB} mt-2`}>{em.review}</p>}
      {notice && <p className={`${SUB} mt-1`}>{notice}</p>}
    </div>
  );
}

const CALL_DIGITS = "font-bold tabular-nums tracking-[0.06em]";
/** The smaller line inside the same button: the countries the number covers. */
const CALL_SUB = "text-[13px] font-normal normal-case tracking-normal opacity-90";

function CallButton({ n, covers }: { n: ResolvedNumber; covers: string | null }) {
  if (!n.tel) return null;
  return (
    <a
      href={n.tel}
      className={cn(buttonClass("red"), "flex-col gap-1 py-3")}
      aria-label={`Call ${n.entry.number}${covers ? `, ${covers}` : ""}`}
    >
      <span className={CALL_DIGITS} style={CALL_STYLE}>
        Call {n.entry.number}
      </span>
      {covers && <span className={CALL_SUB}>{covers}</span>}
    </a>
  );
}

/**
 * The source, the day it was read and whether anybody local has confirmed it —
 * one sentence, never a bare date. Loud, not greyed, once that is over a year
 * old: the staleness belongs on this line and never on the digits (plan §5.4).
 */
function AgeLine({ n, warnings }: { n: ResolvedNumber; warnings: string[] }) {
  // A caveat already read out above the numbers is not repeated on the row.
  const note = n.entry.note && !warnings.includes(n.entry.note) ? n.entry.note : null;
  return (
    <>
      {/* Quiet, not white: the red button is the hero, and this is the caveat
          that sits under it (mockup spec §0). */}
      {note && <p className={`${SUB} mt-2`}>{note}</p>}
      <p className={cn("mt-2 text-[15px] leading-snug", n.age.loud ? "font-medium text-alert" : "text-mist")}>
        {n.age.sentence}
      </p>
    </>
  );
}

/**
 * Label left, number right — and it WRAPS. A four-digit short code sits on the
 * line; a full international number (`+33 4 50 53 16 89`) drops to its own line
 * on a narrow phone rather than running off the edge of the screen.
 */
const ROW_INNER = "flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-snow";
const ROW_NUMBER_STYLE = { fontSize: "clamp(22px, 6.8vw, 28px)" } as const;

function notDialable(kind: ResolvedNumber["entry"]["contact"]): string {
  if (kind === "radio") return "By radio · not a phone number";
  if (kind === "sms") return "Text message only · not a voice call";
  return "Not a phone number";
}

function NumberRow({ n, warnings }: { n: ResolvedNumber; warnings: string[] }) {
  return (
    <li className="border-t border-hairline px-5 py-3">
      {n.tel ? (
        <a href={n.tel} className={ROW_INNER}>
          <span className="min-w-0 text-[17px]">{n.entry.label}</span>
          <span className="font-medium tabular-nums underline" style={ROW_NUMBER_STYLE}>
            {n.entry.number}
          </span>
        </a>
      ) : (
        <div className={ROW_INNER}>
          <span className="min-w-0 text-[17px]">
            {n.entry.label}
            <span className={`block ${SUB}`}>{notDialable(n.entry.contact)}</span>
          </span>
          <span className="font-medium tabular-nums" style={ROW_NUMBER_STYLE}>
            {n.entry.number}
          </span>
        </div>
      )}
      <AgeLine n={n} warnings={warnings} />
    </li>
  );
}

/** The named holes in this country's data. A hole nobody is told about is a lie. */
function WhatIsNotHeld({ em }: { em: EmergencyResolution }) {
  if (em.gaps.length === 0) return null;
  return (
    <div className="mt-6 border-t border-hairline px-5 pt-3">
      <SectionLabel>What ICEFALL does not hold here</SectionLabel>
      {em.gaps.map((g) => (
        <p key={g} className={`${SUB} mt-2`}>
          {g}
        </p>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Text message                                                                */
/* -------------------------------------------------------------------------- */

function TextMessageRow({
  position,
  placeName,
  contacts,
}: {
  position: KnownPosition | null;
  placeName: string | null;
  contacts: { name: string; number: string }[];
}) {
  const ios = typeof navigator !== "undefined" && isIosUserAgent(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const body = smsBody(position, placeName);
  const reachable = contacts.filter((c) => telHref(c.number));

  return (
    <section aria-labelledby="sms-heading" className="mt-9 px-5">
      <h2 id="sms-heading" className="sr-only">
        Send your position by text message
      </h2>
      {reachable.length > 0 ? (
        reachable.map((c, i) => (
          <a
            key={`${c.name}-${c.number}`}
            href={smsHref(c.number, body, ios)}
            className={cn(buttonClass("azure-outline"), i > 0 && "mt-3")}
          >
            Send SMS with my location to {c.name || c.number}
          </a>
        ))
      ) : (
        <a href={smsHref(null, body, ios)} className={buttonClass("azure-outline")}>
          Send SMS with my location
        </a>
      )}
      <p className={`${SUB} mt-2`}>SMS may work when data doesn't.</p>
      <p className={`${SUB} mt-2`}>{SMS_HONESTY}</p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Clock                                                                       */
/* -------------------------------------------------------------------------- */

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}

/** "14:21" — only ever shown for a fix taken today; older ones keep the date. */
function shortTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
