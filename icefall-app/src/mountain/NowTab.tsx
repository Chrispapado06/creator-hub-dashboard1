/**
 * NOW — what matters this minute on the mountain (brief M5, plan §3.2).
 *
 * REBUILT TO THE OWNER'S MOCKUP (docs/mountain-mode-mockups.md §3, mockup 6).
 * The old screen stacked six evenly-weighted sections and read as a wall; this
 * one has ONE HERO — the turnaround countdown — and quiet flat rows under it:
 *
 *   DAY 2 · SUMMIT · MONT BLANC          small azure caps
 *   TURN AROUND IN                       grey caps
 *   3:40                                 the hero, enormous, white
 *   hours : minutes · turnaround …       one grey sub-line
 *   ── NEXT / DAYLIGHT / ALTITUDE …      flat hairline rows, value left,
 *                                        grey detail right-aligned
 *   ── AGAINST PLAN                      the honest §9-case-1 line
 *   CHECK HOW I FEEL                     full-width filled azure
 *
 * Nothing was computed differently to get there. Every figure, reason and
 * refusal on this screen comes from the same functions as before — the layout
 * changed, the arithmetic did not.
 *
 * ONLY THE WEATHER WANTS A SIGNAL, and it is the only thing that goes quiet
 * without one. It is fetched by `nowForecast.ts`, never by this file, and only
 * when the check has confirmed a connection.
 *
 * NOTHING IS INVENTED. With no turnaround set the hero slot keeps its shape and
 * says so. With no position in the last hour, distances and altitude go silent
 * in their own rows rather than vanishing. Ascent is shown only when both
 * heights exist and yours has a stated accuracy. There is no plan with times
 * anywhere in the app, so the plan-status row says that instead of a pace.
 *
 * THE SMALL GREY LINES UNDER ROWS ARE NOT DECORATION AND ARE NOT HIDDEN. Where
 * a figure rests on something the athlete should know — an hour-old fix, a
 * straight line rather than a path, a track ICEFALL only partly watched — the
 * sentence stays on screen under its own row. This is safety text; it does not
 * go behind a tap to make a screenshot tidier.
 *
 * The turnaround is set at /mountain/now/turnaround, with `TurnaroundSetter`.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import {
  NO_CAMPS_ON_ROUTE,
  NO_CAMPS_RECORDED,
  OSM_ATTRIBUTION,
  campsFor,
} from "@/data/mountainCamps";
import { cn } from "@/lib/utils";
import { activeSessionSummary, type ActiveSessionSummary } from "@/tracking/activeSession";
import { addDays, todayISO } from "@/trip/trip";

import { useBreadcrumbState, useTrackCrumbs } from "./breadcrumbs";
import {
  CLOCK_CHECK,
  FLAT_HORIZON_NOTE,
  clockLooksWrong,
  daylightAt,
  solarDateISO,
  type DaylightNow,
} from "./daylight";
import { ageLabel, durationLabel } from "./format";
import { splitTrack } from "./geo";
import { useNowForecast } from "./nowForecast";
import {
  NO_PLAN_STATUS,
  NO_PLAN_TIMES,
  PACE_FLOOR_NOTE,
  PLAN_STATUS_LABEL,
  STRAIGHT_LINE_NOTE,
  altitudeReading,
  ascentLabel,
  countdownDigits,
  dayLabel,
  distanceLabel,
  forecastSubject,
  paceAscentLabel,
  paceOverWindow,
  paceUnavailable,
  placeReading,
  placeRowSpecs,
  speedLabel,
  splitUnit,
  sunInputFor,
  verticalRateLabel,
  type PlaceReading,
  type PlaceRowSpec,
  type SunInput,
} from "./nowModel";
import { MOUNTAIN_PATHS } from "./paths";
import {
  positionFreshness,
  useLastKnownPosition,
  useLivePosition,
  type KnownPosition,
  type PositionFreshness,
} from "./position";
import { useMountainTrip, type MountainTrip } from "./trip";
import { TurnaroundSetter } from "./TurnaroundSetter";
import {
  GUIDE_FIRST,
  TURNAROUND_UNSET,
  phoneTimeZone,
  useTurnaround,
  type TurnaroundPhase,
  type TurnaroundSetting,
} from "./turnaround";
import { BigButton, HeroNumber, M_LABEL, M_ROW, Row, SectionLabel, StatRow } from "./ui";

const TURNAROUND_PATH = `${MOUNTAIN_PATHS.now}/turnaround`;

export default function NowTab() {
  return (
    <Routes>
      <Route index element={<Now />} />
      <Route path="turnaround" element={<SetTurnaround />} />
      <Route path="*" element={<Navigate to={MOUNTAIN_PATHS.now} replace />} />
    </Routes>
  );
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                                */
/* -------------------------------------------------------------------------- */

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * A row's value when there is no value — the reason, in the row's own slot, at
 * body size rather than the 24 px a real figure gets. The row keeps its shape
 * and its hairline; the layout never collapses around an absent number.
 */
const absent = (text: string) => <span className="m-text-body">{text}</span>;

/**
 * One quiet line under a row: where a figure came from, or what it does not
 * cover. Grey, small, never boxed, never behind a tap.
 */
function Note({ children, tone = "dim" }: { children: ReactNode; tone?: "dim" | "mist" | "alert" }) {
  return (
    <p
      className={cn(
        "m-text-label px-5 pb-4 leading-snug",
        tone === "alert" ? "text-alert" : tone === "mist" ? "text-mist" : "text-mist-dim",
      )}
    >
      {children}
    </p>
  );
}

/** A secondary control that belongs to the row above it, not to the screen. */
function RowAction({ children, onClick, to }: { children: ReactNode; onClick?: () => void; to?: string }) {
  return (
    <div className="flex px-5 pb-4">
      <BigButton variant="azure-outline" size="sm" onClick={onClick} to={to}>
        {children}
      </BigButton>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                  */
/* -------------------------------------------------------------------------- */

function Now() {
  const { trip, day, runningToday, itineraryDay } = useMountainTrip();
  // Ticks every second and re-reads the wall clock on every return to view.
  const { setting, phase, now } = useTurnaround(trip?.id);
  const position = useLastKnownPosition();
  const freshness = position ? positionFreshness(position, now) : null;
  const recording = useUnfinishedRecording();

  const offsetMin = -new Date(now).getTimezoneOffset();
  const clockLon = position && freshness !== "silent" ? position.lon : (trip?.summit?.lon ?? null);
  const clockWrong = clockLon !== null && clockLooksWrong(offsetMin, clockLon);

  return (
    <div className="flex min-h-full flex-col">
      {/* The trip line: small azure caps, the quietest thing on the screen. */}
      <header className="px-5 pb-5 pt-6">
        <SectionLabel as="h1" tone={trip ? "azure" : "mist"}>
          {dayLabel(trip, day, itineraryDay, runningToday)}
        </SectionLabel>
        {itineraryDay && !itineraryDay.summitDay && (
          <p className="m-text-body mt-2 text-mist">{itineraryDay.label}</p>
        )}
        {trip?.notice && (
          <p className="m-text-label mt-1 leading-snug text-mist-dim">{trip.notice}</p>
        )}
      </header>

      {clockWrong && (
        <p className="m-text-body px-5 pb-5 leading-snug text-alert">{CLOCK_CHECK}</p>
      )}

      <TurnaroundHero trip={trip} setting={setting} phase={phase} now={now} />

      {recording && (
        <Row to={`/activity/live/${recording.activityTypeId}`} chevron>
          <span className="flex flex-col gap-1 py-3">
            <span className={M_LABEL}>Recording</span>
            <span className="m-text-title text-snow">
              Unfinished — {durationLabel(recording.elapsedMs)} recorded
            </span>
            <span className="m-text-label text-mist">It comes back paused.</span>
          </span>
        </Row>
      )}

      <PlacesRows
        trip={trip}
        itinerarySleep={itineraryDay?.sleepAt ?? null}
        position={position}
        freshness={freshness}
      />
      <DaylightRow trip={trip} position={position} freshness={freshness} now={now} />
      <AltitudeRow position={position} freshness={freshness} now={now} />
      <WeatherRow trip={trip} now={now} />
      <PaceRow now={now} />
      <PlanStatusRow />

      <div className="flex-1" />
      {/* Pinned in thumb reach, inside the shell's scroller. */}
      <div className="sticky bottom-0 border-t border-hairline bg-obsidian px-5 pb-4 pt-3">
        <BigButton variant="azure" to={MOUNTAIN_PATHS.body}>
          Check how I feel
        </BigButton>
      </div>
    </div>
  );
}

/** Read once and on every return to view: the saved session holds the whole track, too big to parse every second. */
function useUnfinishedRecording(): ActiveSessionSummary | null {
  const [summary, setSummary] = useState(activeSessionSummary);
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible") setSummary(activeSessionSummary());
    };
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);
  return summary;
}

/* -------------------------------------------------------------------------- */
/* The hero: the turnaround                                                    */
/* -------------------------------------------------------------------------- */

function whenLabel(setting: TurnaroundSetting, now: number): string {
  const at = Date.parse(setting.at);
  const today = todayISO(new Date(now));
  const date = todayISO(new Date(at));
  const dayWord =
    date === today
      ? "today"
      : date === addDays(today, 1)
        ? "tomorrow"
        : new Date(at).toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
  return `${clock(at)} ${dayWord}`;
}

interface HeroView {
  label: string;
  labelTone: "mist" | "alert";
  value: string;
  tone: "snow" | "mist" | "alert";
  size: "hero" | "large";
  /** The one grey line under the hero, as in the mockup. */
  sub: string | null;
  subTone: "snow" | "mist";
  /** Anything further that is true right now — a snooze, the guide rule. */
  notes: string[];
}

/**
 * What the hero says in each phase. `set` and `countdown` are the mockup's own
 * state; the rest keep the same slot rather than swapping the screen for
 * another shape. The full-screen amber alarm is a different surface
 * (`TurnaroundAlarm.tsx`) and is unaffected by this.
 */
function heroView(
  trip: MountainTrip | null,
  setting: TurnaroundSetting | null,
  phase: TurnaroundPhase,
  now: number,
): HeroView {
  const base = { labelTone: "mist" as const, subTone: "mist" as const, notes: [] as string[] };

  if (phase.kind === "unset" || !setting) {
    return {
      ...base,
      label: "Turnaround",
      value: TURNAROUND_UNSET,
      tone: "mist",
      size: "large",
      sub: trip ? null : "Open a trip to set one.",
    };
  }

  if (phase.kind === "set" || phase.kind === "countdown") {
    const { digits, unit } = countdownDigits(phase.msLeft);
    return {
      ...base,
      label: "Turn around in",
      value: digits,
      // Amber inside the last half-hour, exactly as the alarm's own window.
      tone: phase.kind === "countdown" ? "alert" : "snow",
      size: "hero",
      sub: `${unit} · turnaround ${whenLabel(setting, now)} · set on this phone`,
    };
  }

  if (phase.kind === "turned") {
    return {
      ...base,
      label: "Turned around",
      value: clock(Date.parse(phase.turnedAt)),
      tone: "snow",
      size: "hero",
      sub: null,
    };
  }

  // due · snoozed · overdue · missed — all past the time, all amber.
  const notes = [GUIDE_FIRST];
  if (phase.kind === "snoozed") {
    notes.unshift(`Snoozed for ${durationLabel(phase.msUntilSnoozeEnds)} more.`);
  }
  return {
    label: "Turn around",
    labelTone: "alert",
    value: clock(Date.parse(setting.at)),
    tone: "alert",
    size: "hero",
    sub: `Your turnaround time passed ${durationLabel(phase.msOver)} ago.`,
    subTone: "snow",
    notes,
  };
}

function TurnaroundHero({
  trip,
  setting,
  phase,
  now,
}: {
  trip: MountainTrip | null;
  setting: TurnaroundSetting | null;
  phase: TurnaroundPhase;
  now: number;
}) {
  const view = heroView(trip, setting, phase, now);
  const zoneMoved = setting && setting.timeZone !== phoneTimeZone();
  const unset = phase.kind === "unset" || !setting;

  return (
    <section className="px-5 pb-7" aria-live="off">
      <SectionLabel as="h2" tone={view.labelTone}>
        {view.label}
      </SectionLabel>

      {/* min-h keeps the hero's slot when the value is a sentence, not a clock. */}
      <HeroNumber
        className="mt-2 min-h-[72px]"
        value={view.value}
        size={view.size}
        tone={view.tone}
      />

      {view.sub && (
        <p
          className={cn(
            "m-text-body mt-3 leading-snug",
            view.subTone === "snow" ? "text-snow" : "text-mist",
          )}
        >
          {view.sub}
        </p>
      )}

      {view.notes.map((n) => (
        <p key={n} className="m-text-label mt-2 leading-snug text-mist">
          {n}
        </p>
      ))}

      {zoneMoved && setting && (
        <p className="m-text-label mt-2 leading-snug text-alert">
          Set on {setting.timeZone} time. This phone is now on {phoneTimeZone()}.
        </p>
      )}

      {trip && (
        <BigButton
          className={cn("mt-5", !unset && "w-auto")}
          variant="azure-outline"
          size={unset ? "lg" : "sm"}
          to={TURNAROUND_PATH}
        >
          {unset ? "Set turnaround time" : phase.kind === "turned" ? "Set a new time" : "Change"}
        </BigButton>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* NEXT — the places, and how far they are                                     */
/* -------------------------------------------------------------------------- */

/** "1.9 km · NW · 520 m to climb" — the mockup's right-aligned grey detail. */
function placeNote(reading: PlaceReading): string {
  return [
    distanceLabel(reading.distanceM),
    reading.direction,
    reading.ascentM !== null ? ascentLabel(reading.ascentM) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function PlacesRows({
  trip,
  itinerarySleep,
  position,
  freshness,
}: {
  trip: MountainTrip | null;
  itinerarySleep: { name: string; lat: number; lon: number; elevationM: number | null } | null;
  position: KnownPosition | null;
  freshness: PositionFreshness | null;
}) {
  if (!trip) return null;
  const record = trip.mountainId ? campsFor(trip.mountainId) : null;
  const usable = position && freshness && freshness !== "silent" ? position : null;
  const stale = freshness === "stale";

  if (!usable) {
    // The slot stays. A distance from no position is not a distance.
    return (
      <StatRow
        label="Next"
        value={absent("Distances need a GPS position from the last hour.")}
        tone="mist"
      />
    );
  }

  const rows = placeRowSpecs({
    summit: trip.summit,
    peakName: trip.peakName,
    peakElevationM: trip.peakElevationM,
    itinerarySleep,
    camps: record?.camps ?? null,
    pos: usable,
  })
    .map((spec) => ({ spec, reading: placeReading(spec.place, usable, freshness) }))
    .filter((r): r is { spec: PlaceRowSpec; reading: PlaceReading } => r.reading !== null);

  return (
    <>
      {rows.map(({ spec, reading }, i) => (
        <div key={spec.heading}>
          <StatRow
            label={spec.heading}
            value={reading.name}
            note={placeNote(reading)}
            tone={stale ? "mist" : "snow"}
          />
          {/* Said once, under the first row: it is true of all of them. */}
          {stale && i === 0 && (
            <Note tone="alert">From an old position. No directions until it updates.</Note>
          )}
          {reading.ascentM === null && reading.ascentMissing && (
            <Note>No ascent figure. {reading.ascentMissing}</Note>
          )}
          {spec.basis && <Note>{spec.basis}</Note>}
        </div>
      ))}
      <Note>{STRAIGHT_LINE_NOTE}</Note>
      {!record ? (
        <Note>{NO_CAMPS_RECORDED}</Note>
      ) : record.camps.length === 0 ? (
        <Note>{NO_CAMPS_ON_ROUTE}</Note>
      ) : (
        rows.some((r) => r.spec.source === "camp") && <Note>{OSM_ATTRIBUTION}</Note>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* DAYLIGHT                                                                    */
/* -------------------------------------------------------------------------- */

function sunSource(input: SunInput): string {
  if (input.from.kind === "summit") {
    return `The coordinates of ${input.from.peakName ?? "the summit"} (no GPS position in the last hour), a sea-level horizon`;
  }
  const alt = input.from.altitudeM;
  return `Your GPS position ${ageLabel(input.from.ageMs)}${alt !== null ? `, at about ${(Math.round(alt / 10) * 10).toLocaleString("en-GB")} m` : ", no altitude"}`;
}

/**
 * The mockup's shape for this row: a figure on the left, the clock time it
 * turns on right-aligned in grey, and anything further on a line of its own.
 */
function daylightRow(
  light: DaylightNow,
  now: number,
): { value: string; note: string | null; extra: string | null } {
  switch (light.kind) {
    case "day":
      return {
        value: durationLabel(light.msToSunset),
        note: `sunset ${clock(light.sunset)}`,
        extra:
          light.msTwilight !== null && light.civilDusk !== null
            ? `+${durationLabel(light.msTwilight)} of usable light after sunset · dark by ${clock(light.civilDusk)}`
            : null,
      };
    case "twilight":
      return {
        value: durationLabel(light.msToDark),
        note: `dark by ${clock(light.civilDusk)}`,
        extra: "The sun has set. This is usable light, not daylight.",
      };
    case "before-sunrise":
      return {
        value: durationLabel(light.msToSunrise),
        note: `to sunrise · ${clock(light.sunrise)}`,
        extra: null,
      };
    case "dark":
      return light.nextSunrise !== null
        ? {
            value: "Dark",
            note: `sunrise in ${durationLabel(light.nextSunrise - now)} · ${clock(light.nextSunrise)}`,
            extra: null,
          }
        : { value: "Dark", note: null, extra: "The sun does not rise tomorrow here." };
    case "midnight-sun":
      return { value: "No sunset", note: null, extra: "The sun stays up all day here today." };
    case "polar-night":
      return {
        value: "No sunrise",
        note: null,
        extra: "The sun stays below the horizon all day here today.",
      };
  }
}

function DaylightRow({
  trip,
  position,
  freshness,
  now,
}: {
  trip: MountainTrip | null;
  position: KnownPosition | null;
  freshness: PositionFreshness | null;
  now: number;
}) {
  const input = sunInputFor(position, freshness, trip?.summit ?? null, trip?.peakName ?? null, now);
  // The sun moves slowly: recompute once a minute, not every tick.
  const minute = Math.floor(now / 60_000);
  const light = useMemo<DaylightNow | null>(() => {
    if (!input) return null;
    const today = solarDateISO(now, input.lon);
    return daylightAt(now, today, addDays(today, 1), input.lat, input.lon, input.altitudeM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minute, input?.lat, input?.lon, input?.altitudeM]);

  if (!input || !light) {
    return (
      <StatRow
        label="Daylight"
        value={absent(
          "No daylight figure. It needs a GPS position from the last hour, or a trip on a mountain ICEFALL knows.",
        )}
        tone="mist"
      />
    );
  }

  const row = daylightRow(light, now);
  const { value, unit } = splitUnit(row.value);

  return (
    <>
      <StatRow label="Daylight" value={value} unit={unit ?? undefined} note={row.note ?? undefined} />
      {row.extra && <Note tone="mist">{row.extra}</Note>}
      <Note>
        Worked out on this phone from: {sunSource(input)}, and this phone's clock ({phoneTimeZone()}
        ). {FLAT_HORIZON_NOTE}
      </Note>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* ALTITUDE                                                                    */
/* -------------------------------------------------------------------------- */

/** How long to keep GPS on after a tap, unless a good fix arrives first. */
const FIND_MAX_MS = 45_000;
const GOOD_FIX_M = 30;

function AltitudeRow({
  position,
  freshness,
  now,
}: {
  position: KnownPosition | null;
  freshness: PositionFreshness | null;
  now: number;
}) {
  const [finding, setFinding] = useState(false);
  const [lastProblem, setLastProblem] = useState<string | null>(null);
  const live = useLivePosition(finding);

  // GPS is the biggest drain after the screen: stop once a good fix is in, or after a while.
  useEffect(() => {
    if (!finding) return;
    if (live.status === "denied") {
      setLastProblem("Location is off for ICEFALL. Turn it on in your phone's settings.");
      setFinding(false);
    } else if (live.status === "unsupported") {
      setLastProblem("This browser gives ICEFALL no GPS.");
      setFinding(false);
    } else if (live.fix && live.fix.accuracyM !== null && live.fix.accuracyM <= GOOD_FIX_M) {
      setFinding(false);
    } else if (live.startedAt && now - live.startedAt > FIND_MAX_MS) {
      if (!live.fix) setLastProblem("No GPS fix yet. Try again with open sky above you.");
      setFinding(false);
    }
  }, [finding, live.status, live.fix, live.startedAt, now]);

  const reading = altitudeReading(position, freshness);
  const stale = freshness === "stale";
  const figure = reading.kind === "reading" ? splitUnit(reading.figure) : null;

  return (
    <>
      {reading.kind === "none" ? (
        <StatRow label="Altitude" value={absent(reading.reason)} tone="mist" />
      ) : (
        <StatRow
          label="Altitude"
          value={figure!.value}
          unit={figure!.unit ?? undefined}
          note={reading.qualifier}
          tone={stale ? "mist" : "snow"}
        />
      )}

      {reading.kind === "reading" && position && freshness !== "fresh" && (
        <Note tone={stale ? "alert" : "mist"}>
          {stale
            ? `Old reading · ${ageLabel(now - position.at)} · you may have moved`
            : ageLabel(now - position.at)}
        </Note>
      )}
      {reading.kind === "reading" && <Note>GPS altitude is approximate.</Note>}

      {finding ? (
        <p className="m-text-body flex min-h-16 items-center px-5 text-snow" role="status">
          Looking for GPS… stand still with open sky above you.
        </p>
      ) : (
        <RowAction
          onClick={() => {
            setLastProblem(null);
            setFinding(true);
          }}
        >
          {position ? "Update my position" : "Find my position"}
        </RowAction>
      )}
      {lastProblem && !finding && <Note tone="alert">{lastProblem}</Note>}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* WEATHER — the one row that wants a signal                                   */
/* -------------------------------------------------------------------------- */

function WeatherRow({ trip, now }: { trip: MountainTrip | null; now: number }) {
  const subject = useMemo(() => forecastSubject(trip), [trip]);
  const { view, attribution, disclaimer, refresh, refreshing } = useNowForecast(subject, now);

  if (view.kind === "loading") {
    return <StatRow label="Weather" value={absent("Getting the forecast…")} tone="mist" />;
  }
  if (view.kind === "none") {
    return (
      <>
        <StatRow label="Weather" value={absent(view.reason)} tone="mist" />
        {refresh && (
          <RowAction onClick={refresh}>
            {refreshing ? "Getting the forecast…" : "Update forecast"}
          </RowAction>
        )}
      </>
    );
  }

  const headline = view.headline ? splitUnit(view.headline.figure) : null;
  const note = [view.conditionWord, view.headline?.caption].filter(Boolean).join(" · ");
  const figures = view.figures.map((f) => `${f.value} ${f.label.toLowerCase()}`).join(" · ");

  return (
    <>
      <StatRow
        label="Weather"
        value={headline ? headline.value : (view.conditionWord ?? absent("No reading."))}
        unit={headline?.unit ?? undefined}
        note={headline ? note : undefined}
        tone={view.grey ? "mist" : "snow"}
      />
      {figures && <Note tone={view.grey ? "dim" : "mist"}>{figures}</Note>}
      {view.ageSentence && <Note tone={view.grey ? "alert" : "mist"}>{view.ageSentence}</Note>}
      <Note>
        {attribution} {disclaimer}
      </Note>
      {refresh && (
        <RowAction onClick={refresh}>
          {refreshing ? "Getting the forecast…" : "Update forecast"}
        </RowAction>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* LAST HOUR — pace from this phone's own breadcrumbs                          */
/* -------------------------------------------------------------------------- */

/**
 * From this phone's own breadcrumbs, which are dropped while Mountain mode is
 * open whether or not a recording is running — somebody walking to a hut has
 * not pressed Start.
 */
function PaceRow({ now }: { now: number }) {
  const { crumbs, loading } = useTrackCrumbs();
  const recorder = useBreadcrumbState();
  // Walking pace does not change inside a second, and the window is an hour.
  const minute = Math.floor(now / 60_000);
  const pace = useMemo(
    () => paceOverWindow(splitTrack(crumbs), now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [crumbs, minute],
  );

  if (loading) {
    return <StatRow label="Last hour" value={absent("Reading your track…")} tone="mist" />;
  }
  if (pace.kind === "none") {
    return (
      <>
        <StatRow
          label="Last hour"
          value={absent(paceUnavailable(recorder.status, recorder.storageError) ?? pace.reason)}
          tone="mist"
        />
        <Note>{NO_PLAN_TIMES}</Note>
      </>
    );
  }

  const walked = splitUnit(distanceLabel(pace.walkedM));

  return (
    <>
      <StatRow
        label="Last hour"
        value={walked.value}
        unit={walked.unit ?? undefined}
        note={`walked · ${speedLabel(pace.metresPerHour)} · ${durationLabel(pace.watchedMs)} watched`}
      />
      <Note tone="mist">
        {paceAscentLabel(pace.ascent)}
        {pace.verticalMPerHour !== null && ` · ${verticalRateLabel(pace.verticalMPerHour)}`}
      </Note>
      {pace.gaps > 0 && (
        <Note>
          {pace.gaps} break{pace.gaps === 1 ? "" : "s"} in the track. {PACE_FLOOR_NOTE}
        </Note>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* AGAINST PLAN — the mockup's status line, honestly (spec §9 case 1)          */
/* -------------------------------------------------------------------------- */

function PlanStatusRow() {
  return (
    <div className={cn(M_ROW, "flex-col items-stretch justify-center gap-1 py-4")}>
      <SectionLabel>{PLAN_STATUS_LABEL}</SectionLabel>
      <p className="m-text-body leading-snug text-mist">{NO_PLAN_STATUS}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Setting the turnaround                                                      */
/* -------------------------------------------------------------------------- */

/** The one turnaround setter (`TurnaroundSetter.tsx`), drawn inside the shell so SOS stays in reach. */
function SetTurnaround() {
  const navigate = useNavigate();
  const { trip, today } = useMountainTrip();

  if (!trip) {
    return (
      <div className="px-5 py-8">
        <p className="m-text-title text-snow">Open a trip to set a turnaround time.</p>
        <BigButton className="mt-5" variant="azure-outline" to={MOUNTAIN_PATHS.now}>
          Back to Now
        </BigButton>
      </div>
    );
  }

  return (
    <TurnaroundSetter trip={trip} today={today} onClose={() => navigate(MOUNTAIN_PATHS.now)} />
  );
}
