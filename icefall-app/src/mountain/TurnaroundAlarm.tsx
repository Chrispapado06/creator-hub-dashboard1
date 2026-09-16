/**
 * THE TURNAROUND ALARM (brief M7, plan §3.7, slice item 8).
 *
 * Mounted once by `SafetyLayer.tsx` above the routes, so it is on every screen:
 * Mountain mode (SOS included), the live tracker and the full app. Draws inside
 * the phone frame: full-screen states are `absolute inset-0`, lines are one row.
 *
 *   unset / set / turned   nothing (the Now tab shows the quiet states)
 *   countdown ≤ 30 min     a line on every screen but Now, screen lock held
 *   due                    full-screen amber, sound and vibration where allowed
 *   snoozed                a line counting down to the next alarm
 *   overdue (3 snoozes)    a permanent line counting UP — never quiet
 *   missed                 full screen: "This alarm did not sound"
 *
 * On the SOS screen due and missed are lines, not full screens — nothing may
 * cover rescue numbers and coordinates in an emergency.
 *
 * THE LOOK (mockup spec §4, mockup 1 right). A thick amber frame around the
 * whole screen, then one column down the middle: warning triangle, amber caps
 * heading, the turnaround time as an enormous amber hero, two quiet hairline
 * rows (SUMMIT, DAYLIGHT), the one filled amber TURNING AROUND button, snooze
 * as an underlined link rather than a second button, and the guide footnote.
 * The ground stays near-black: the amber is the alarm, not the wallpaper.
 *
 * THE WALL CLOCK DECIDES. `useTurnaround` re-reads it every second and on every
 * return to the front; `observeTurnaround` runs on each of those while the page
 * is visible, which is how a turnaround that passed while the phone was locked
 * comes back as "missed" rather than as a normal alarm.
 *
 * No entrance animation or pulse anywhere, so reduced motion holds by
 * construction.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { loadActiveSession } from "@/tracking/activeSession";
import { useScreenWakeLock } from "@/tracking/wakeLock";

import {
  alarmSurface,
  daylightLines,
  daylightView,
  lineText,
  missedLines,
  snoozeLabel,
  summitEtaAtPace,
  wantsAttention,
  wantsWakeLock,
  zoneWarning,
  type AlarmLineTone,
  type PacePoint,
} from "./alarmModel";
import {
  SOUND_SENTENCES,
  VIBRATION_SENTENCES,
  beep,
  buzz,
  primeAlarmSound,
  soundState,
  stopBuzz,
  vibrationState,
} from "./alarmSound";
import { useBattery } from "./battery";
import { durationLabel } from "./format";
import { MOUNTAIN_TABBAR_PX, SosButton } from "./MountainShell";
import { MOUNTAIN_PATHS } from "./paths";
import { useLastKnownPosition } from "./position";
import { useMountainTrip, type MountainTrip } from "./trip";
import { BigButton, Row, SectionLabel } from "./ui";
import {
  GUIDE_FIRST,
  MAX_SNOOZES,
  dismissMissed,
  markTurnedAround,
  observeTurnaround,
  phoneTimeZone,
  snoozeTurnaround,
  useTurnaround,
  type TurnaroundPhase,
  type TurnaroundSetting,
} from "./turnaround";

export interface TurnaroundAlarmProps {
  /** Where it is mounted: inside Mountain mode, over the live tracker, or over the full app. */
  placement: "mountain" | "tracker" | "app";
}

/**
 * The height of the amber line while it is up. Mountain mode's shell and the
 * tracker's headers make room for it, so it covers none of their controls.
 */
export const ALARM_LINE_HEIGHT_VAR = "--icefall-alarm-line-h";

const ATTENTION_EVERY_MS = 3000;

/**
 * SIZES ARE WRITTEN OUT HERE, NOT TAKEN FROM `.m-text-*` (mountainTheme.css).
 *
 * That stylesheet arrives with `MountainShell`, and this alarm also draws over
 * the live tracker and the full app, where the shell may never have loaded —
 * after a reload straight onto a full-app route, for instance. A hero that
 * silently fell back to body size on the one screen that must be unmissable is
 * not a risk worth the tidiness. The large-text scale tokens are still honoured
 * (they default to 1), so Settings' large text still grows the alarm.
 */
const HERO = "text-[calc(72px*var(--mountain-number-scale,1))] font-light leading-none tracking-[-0.02em] tabular-nums";
const VALUE = "text-[calc(24px*var(--mountain-text-scale,1))] leading-tight";
const SUB = "text-[calc(17px*var(--mountain-text-scale,1))] leading-snug";
const SMALL = "text-[calc(14px*var(--mountain-text-scale,1))] leading-snug";

export const KEEP_OPEN_LINE = "Keep ICEFALL open on screen for the alarm to sound.";
export const NATIVE_FIX_LINE =
  "A web page cannot sound with the screen locked or the app closed. The ICEFALL app for iPhone and Android will fix this.";

export default function TurnaroundAlarm({ placement }: TurnaroundAlarmProps) {
  const { trip } = useMountainTrip();
  const { setting, phase, now } = useTurnaround(trip?.id);
  const { pathname } = useLocation();
  const tripId = trip?.id ?? null;

  const surface = alarmSurface(phase, {
    onNowTab: pathname === MOUNTAIN_PATHS.now || pathname.startsWith(`${MOUNTAIN_PATHS.now}/`),
    onSos: pathname === MOUNTAIN_PATHS.sos,
  });

  // On mount, on every tick and on every return to the front. Hidden pages
  // are skipped: nobody saw the alarm, so it must be able to count as missed.
  useEffect(() => {
    if (!tripId || typeof document === "undefined" || document.visibilityState !== "visible") return;
    observeTurnaround(tripId);
  }, [tripId, now]);

  const wake = useScreenWakeLock(!!setting && wantsWakeLock(phase));

  const armed = !!setting && !setting.turnedAt;
  useEffect(() => {
    if (!armed) return;
    // Any tap in the app while a turnaround is set lets the alarm make sound later.
    const prime = () => primeAlarmSound();
    document.addEventListener("pointerdown", prime, { capture: true });
    return () => document.removeEventListener("pointerdown", prime, { capture: true });
  }, [armed]);

  const attention = wantsAttention(surface);
  useEffect(() => {
    if (!attention) return;
    const ring = () => {
      if (document.visibilityState !== "visible") return;
      beep();
      buzz();
    };
    ring();
    const t = setInterval(ring, ATTENTION_EVERY_MS);
    return () => {
      clearInterval(t);
      stopBuzz();
    };
  }, [attention]);

  return (
    <>
      {setting && trip && surface.kind === "full" && (
        <FullAlarm
          trip={trip}
          setting={setting}
          phase={phase}
          now={now}
          missed={surface.reason === "missed"}
          wakeSentence={wake.sentence}
        />
      )}
      {setting && trip && surface.kind === "line" && (
        <AlarmLine
          tone={surface.tone}
          placement={placement}
          tripId={trip.id}
          setting={setting}
          phase={phase}
          screenMayDarken={wake.status === "refused" || wake.status === "unsupported"}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Full screen                                                                 */
/* -------------------------------------------------------------------------- */

function readPacePoints(): PacePoint[] | null {
  const s = loadActiveSession();
  if (!s || s.state.status !== "recording" || s.state.simulated) return null;
  return s.state.points
    .filter((p) => !p.simulated)
    .map((p) => ({ t: p.t, lat: p.lat, lon: p.lon, altitudeM: p.altitudeSmoothed ?? p.altitude }));
}

function FullAlarm({
  trip,
  setting,
  phase,
  now,
  missed,
  wakeSentence,
}: {
  trip: MountainTrip;
  setting: TurnaroundSetting;
  phase: TurnaroundPhase;
  now: number;
  missed: boolean;
  wakeSentence: string | null;
}) {
  const zone = phoneTimeZone();
  const position = useLastKnownPosition();
  const battery = useBattery();

  // The saved recording can be large; read it twice a minute, not every second.
  const paceBucket = Math.floor(now / 30_000);
  const points = useMemo(() => readPacePoints(), [paceBucket]);
  const eta = summitEtaAtPace({ points, now, summit: trip.summit, summitElevationM: trip.peakElevationM });
  const daylight = daylightLines(daylightView({ now, position, summit: trip.summit, peakName: trip.peakName }));

  const msOver = "msOver" in phase ? phase.msOver : 0;
  const canSnooze = setting.snoozeCount < MAX_SNOOZES;
  const warning = zoneWarning(setting, zone);
  const lines = missed ? missedLines(setting, zone, now) : null;
  const status = [
    wakeSentence,
    battery ? `Battery ${battery.percent}%${battery.charging ? ", charging" : ""}.` : null,
    SOUND_SENTENCES[soundState()],
    VIBRATION_SENTENCES[vibrationState()],
  ].filter(Boolean);

  /* THE SUMMIT LINE IS THE MOCKUP'S ONE UNFILLABLE FIGURE (spec §9 case 1).
     `summitEtaAtPace` returns a figure only from a live recording climbing a
     known summit; every other time it returns null and the row keeps its shape
     with the honest absent value. The reason is only ever named when we can be
     sure of it — a missing summit height is a fact about the trip; anything
     else could be any one of the pace guards, so the line states what a pace
     needs rather than claiming which part is missing. */
  const noSummitTarget = !trip.summit || trip.peakElevationM == null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="turnaround-alarm-title turnaround-alarm-time"
      /* THE THICK AMBER FRAME (mockup 1, right). The ground stays the mode's
         own near-black and amber is spent on the frame, the triangle, the
         words and the one button — so the eye lands on the time, not on a
         wall of orange. */
      className="absolute inset-0 z-[80] flex flex-col border-[6px] border-alert bg-obsidian"
      onPointerDown={primeAlarmSound}
    >
      {/* Nothing in the mockup sits up here. The SOS does, because this screen
          covers the shell's own SOS while it is up, and an emergency does not
          wait for a turnaround to be answered. */}
      <div
        className="flex shrink-0 justify-end px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        <SosButton />
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
        <div className="flex flex-col items-center px-5 pt-2 text-center">
          <TriangleAlert size={52} strokeWidth={1.6} aria-hidden className="text-alert" />
          <SectionLabel as="h1" id="turnaround-alarm-title" tone="alert" className="mt-4">
            {lines ? lines[0] : "Time to turn around"}
          </SectionLabel>
          <p id="turnaround-alarm-time" className={cn("mt-2 text-alert", HERO)}>
            {setting.time}
          </p>
          {lines ? (
            <>
              {lines.slice(1).map((l) => (
                <p key={l} className={cn("mt-2 text-mist", SUB)}>
                  {l}
                </p>
              ))}
              <p className={cn("mt-2 text-mist", SMALL)}>{NATIVE_FIX_LINE}</p>
            </>
          ) : (
            <p className={cn("mt-2 text-mist", SUB)}>
              Set by you{msOver >= 60_000 ? ` · ${durationLabel(msOver)} ago` : ""}
            </p>
          )}
          {warning && <p className={cn("mt-3 text-alert", SUB)}>{warning}</p>}
        </div>

        <div className="mt-6">
          <AlarmStatRow
            label="Summit"
            value={eta ? durationLabel(eta.msToSummit) : "Not measured"}
            faint={!eta}
            note={eta ? "away at your pace" : null}
            caveat={
              eta
                ? `At your pace over the last 30 min, ${Math.round(eta.rateMPerH)} m up per hour, from GPS altitude. Rough.`
                : noSummitTarget
                  ? "No summit height saved for this trip, so ICEFALL cannot time it."
                  : "A pace needs a recording running and twenty minutes of steady climbing."
            }
          />
          <AlarmStatRow
            label="Daylight"
            value={daylight ? daylight.big : "Not known"}
            faint={!daylight}
            caveat={daylight ? daylight.small : "No recent position, and no summit saved to work it from."}
          />
        </div>

        {/* Whether this alarm can actually sound. Not in the mockup, and it
            must not compete with it — but it is the honest small print that
            stops the screen promising more than a web page can do. */}
        <div className={cn("mt-6 space-y-1 px-5 text-mist-dim", SMALL)} role="status">
          {status.map((s) => (
            <p key={s as string}>{s}</p>
          ))}
        </div>
      </div>

      <div
        className="shrink-0 px-5 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <BigButton variant="amber" onClick={() => markTurnedAround(setting.tripId)}>
          Turning around
        </BigButton>
        {/* A link, not a second button: the mockup gives the alarm one action
            and one quiet way out, so they must not look like a pair. */}
        <button
          type="button"
          onClick={() => (canSnooze ? snoozeTurnaround(setting.tripId) : dismissMissed(setting.tripId))}
          className={cn("min-h-16 w-full text-center text-snow underline underline-offset-4", SUB)}
        >
          {canSnooze ? snoozeLabel(setting, MAX_SNOOZES) : "Seen"}
        </button>
        <p className={cn("text-center text-mist", SMALL)}>{GUIDE_FIRST}</p>
      </div>
    </div>
  );
}

/**
 * One hairline row under the hero: the grey caps label, the value, a grey note
 * pushed right, and the small print that says where the value came from. Built
 * on the shared `<Row>` so the hairline, the height and the absence of a box
 * all match every other Mountain screen; the sizes are written out for the
 * reason given at the top of this file.
 */
function AlarmStatRow({
  label,
  value,
  note,
  caveat,
  faint,
}: {
  label: string;
  value: string;
  note?: string | null;
  caveat: string;
  faint?: boolean;
}) {
  return (
    <Row className="flex-col items-stretch justify-center gap-1 py-3">
      <SectionLabel>{label}</SectionLabel>
      <span className="flex items-baseline justify-between gap-3">
        <span className={cn(VALUE, faint ? "text-mist" : "text-snow")}>{value}</span>
        {note && <span className={cn("shrink-0 text-right text-mist", SMALL)}>{note}</span>}
      </span>
      <span className={cn("text-mist-dim", SMALL)}>{caveat}</span>
    </Row>
  );
}

/* -------------------------------------------------------------------------- */
/* Lines                                                                       */
/* -------------------------------------------------------------------------- */

function AlarmLine({
  tone,
  placement,
  tripId,
  setting,
  phase,
  screenMayDarken,
}: {
  tone: AlarmLineTone;
  placement: TurnaroundAlarmProps["placement"];
  tripId: string;
  setting: TurnaroundSetting;
  phase: TurnaroundPhase;
  screenMayDarken: boolean;
}) {
  const zone = phoneTimeZone();
  const text = lineText(tone, phase, setting, zone);
  const countdown = tone === "countdown";
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof document === "undefined") return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(ALARM_LINE_HEIGHT_VAR, `${el.offsetHeight}px`);
    publish();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty(ALARM_LINE_HEIGHT_VAR);
    };
  }, [placement]);

  // Mountain mode: just above the tab bar, over the gap the shell opens for it,
  // so the top bar's SOS and the screen's bottom actions stay uncovered.
  // Elsewhere: the top of the frame; the tracker's headers move down for it.
  const position =
    placement === "mountain"
      ? { bottom: `calc(${MOUNTAIN_TABBAR_PX}px + env(safe-area-inset-bottom, 0px))` }
      : { top: 0, paddingTop: "env(safe-area-inset-top, 0px)" };

  const action =
    tone === "missed"
      ? { label: "Seen", run: () => dismissMissed(tripId) }
      : countdown
        ? null
        : { label: "Turning around", run: () => markTurnedAround(tripId) };

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute inset-x-0 z-[65] flex items-center gap-3 pl-4 pr-2",
        /* The same two amber treatments as the full screen, from the tokens, so
           the line reads as the quiet form of the same alarm in both themes. */
        countdown ? "border-l-2 border-alert bg-obsidian" : "bg-alert text-obsidian",
      )}
      style={position}
    >
      <div className="min-w-0 flex-1 py-2">
        <p className={cn("font-semibold tabular-nums", SUB, countdown && "text-alert")}>{text}</p>
        {countdown && (
          <p className={cn("text-mist", SMALL)}>
            {KEEP_OPEN_LINE}
            {screenMayDarken ? " The screen may go dark." : ""}
          </p>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.run}
          className={cn("pointer-events-auto min-h-16 shrink-0 px-4 font-semibold underline underline-offset-4", SUB)}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
