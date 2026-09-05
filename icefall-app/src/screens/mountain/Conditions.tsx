import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CircleDashed,
  Compass,
  Droplets,
  Eye,
  Layers,
  RotateCw,
  Snowflake,
  Thermometer,
  TriangleAlert,
  Wind,
} from "lucide-react";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { UnavailableState, UNAVAILABLE_COPY as ABSENCE_COPY } from "@/components/coach/DataState";
import { UpgradePrompt } from "@/components/growth/UpgradePrompt";
import { useApp } from "@/state/AppState";
import { sync } from "@/services/repository";
import {
  fmtCountdown,
  fmtDate,
  fmtElevation,
  fmtTempCoarse,
  fmtTempInProse,
  fmtTempValue,
  fmtTime,
  fmtVisibility,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Unavailable } from "@/coach/types";
import {
  CONDITIONS_ATTRIBUTION,
  CONDITIONS_DISCLAIMER,
  bandsFor,
  getMountainConditions,
  rateDay,
  rateWindow,
  type MountainConditions,
  type RatedDay,
  type Reading,
  type WindowRating,
} from "@/services/conditions";

/**
 * MOUNTAIN CONDITIONS — what is the mountain doing?
 *
 * One of the three axes of Mountain Intelligence, and the only one where the
 * data is about the world rather than the athlete. That changes the failure
 * mode entirely: a readiness score that is missing is an inconvenience, a
 * forecast that is missing but LOOKS present is a hazard. So the whole screen
 * is built around one rule —
 *
 *   AN ABSENT FIGURE IS RENDERED AS AN ABSENCE, NEVER AS A NUMBER.
 *
 * A blank temperature tile reads exactly like a calm, mild summit. A zero in
 * the wind slot reads like a still day. Both would be read on a phone at 4 a.m.
 * by someone deciding whether to leave the hut, so every value on this screen
 * is a `Reading` from `@/services/conditions` and every null goes through
 * `UnavailableState` or `InlineAbsence` — the designed absence, not a dash.
 *
 * The second rule is that nothing here is permission. The rating words are
 * favourable / mixed / poor / unknown, they describe the modelled weather, and
 * they are never "go", "no-go" or a green tick. `favourable` is deliberately
 * NOT rendered in the summit green used for completed work elsewhere in the
 * app: a green light on a weather panel is an instruction, whatever the label
 * next to it says. The call belongs to the climber and their guide.
 *
 * ⚠️ LICENSING, inherited from `@/services/conditions`: Open-Meteo's free tier
 * is NON-COMMERCIAL, and this screen puts part of its output behind ICEFALL
 * Pro (`conditions.detail`). That has to be resolved — commercial tier or a
 * different provider — before Pro takes money. The provider seam is in the
 * service, so nothing in this file changes when it moves.
 */

/** Gates the elevation breakdown, the 7-day view and the expedition window. */
const PRO_FEATURE = "conditions.detail";

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** 16-point compass. Meteorological convention: the direction wind comes FROM. */
const COMPASS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

const bearing = (deg: number) => {
  const normalised = ((deg % 360) + 360) % 360;
  return `${COMPASS[Math.round(normalised / 22.5) % 16]} ${Math.round(normalised)}°`;
};

/*
 * The minus-sign rule and the temperature/visibility formatters LEFT THIS FILE.
 *
 * They were written here, with their reasoning, and then the Home card was
 * built without them and printed hyphens at 40px one tap from this screen. A
 * rule that lives in the file that obeys it is a rule the next surface will
 * miss, so all four now sit in `@/lib/format` and this screen imports them —
 * the reasoning travelled with them and is worth reading there.
 */
const tempValue = fmtTempValue;
const tempC = (v: number) => `${tempValue(v)}°`;
const tempCoarse = fmtTempCoarse;
const tempInProse = fmtTempInProse;
const kph = (v: number) => `${Math.round(v)}`;

const visibility = fmtVisibility;

/**
 * Local-calendar parse for the API's `YYYY-MM-DD` day keys.
 *
 * `new Date("2026-08-16")` is parsed as UTC midnight, which renders as the
 * PREVIOUS day anywhere west of Greenwich. Forecast rows labelled with the
 * wrong date are worse than no forecast, so the parts are read explicitly.
 */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "Sat 16 Aug" — no comma, so it sits inside a compact card row. */
const dayLabel = (iso: string) =>
  parseLocalDate(iso)
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .replace(",", "");

/* -------------------------------------------------------------------------- */
/* Absence                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The compact absence, for cells inside a dense row.
 *
 * `UnavailableState` is the canonical treatment and is used wherever there is
 * room for it — the current-conditions grid, the freezing level. Inside a
 * four-column band row or a day card it would be three lines tall per cell, so
 * this carries the SAME copy (imported from `DataState`, not rewritten) in one
 * line. It is still a stated reason rather than a dash, which is the part that
 * matters: the athlete learns the figure is missing, not that it is zero.
 */
function InlineAbsence({ reason = "no-data" }: { reason?: Unavailable }) {
  const copy = ABSENCE_COPY[reason];
  return (
    <span
      title={copy.detail}
      className="inline-flex items-center gap-1.5 text-[11px] leading-none text-mist-dim"
    >
      <CircleDashed size={11} strokeWidth={1.5} aria-hidden="true" />
      {copy.title}
      <span className="sr-only">. {copy.detail}</span>
    </span>
  );
}

/** A reading rendered inline: the figure, or the reason there isn't one. */
function InlineReading({
  reading,
  format,
  unit,
  className,
}: {
  reading?: Reading;
  format: (v: number) => string;
  unit?: string;
  className?: string;
}) {
  if (!reading || reading.value === null) return <InlineAbsence reason={reading?.reason} />;
  return (
    <span className={cn("tnum text-snow", className)}>
      {format(reading.value)}
      {unit && <span className="ml-1 text-[11px] font-normal text-mist">{unit}</span>}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Current conditions                                                         */
/* -------------------------------------------------------------------------- */

/** A labelled tile in the current-conditions grid. Full absence treatment. */
function ReadingTile({
  icon: Icon,
  label,
  reading,
  format,
  unit,
  caption,
}: {
  icon: typeof Wind;
  label: string;
  reading?: Reading;
  format: (v: number) => string;
  unit?: string;
  caption?: React.ReactNode;
}) {
  const value = reading?.value ?? null;

  return (
    <div className="min-w-0 rounded-tile border border-hairline p-3.5">
      <div className="flex items-center gap-1.5 text-mist-dim">
        <Icon size={12} strokeWidth={1.6} aria-hidden="true" />
        <span className="section-label text-[9px]">{label}</span>
      </div>

      {value === null ? (
        <div className="mt-3 flex justify-start">
          <UnavailableState
            reason={reading?.reason ?? "no-data"}
            size="sm"
            className="items-start text-left"
          />
        </div>
      ) : (
        <>
          <p className="tnum mt-2.5 text-[20px] font-extralight leading-none text-snow">
            {format(value)}
            {unit && <span className="ml-1 text-[11px] font-light text-mist">{unit}</span>}
          </p>
          {caption && (
            <div className="mt-1.5 text-[11px] leading-tight text-mist-dim">{caption}</div>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Ratings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Rating styling.
 *
 * `favourable` is neutral snow, NOT green. Green reads as permission on a
 * weather panel and ICEFALL never gives permission. `poor` borrows the alert
 * amber because "the weather is worse here" is exactly what amber says
 * elsewhere in the app — it is a description of the sky, not an instruction.
 */
const RATING_TONE: Record<WindowRating, string> = {
  favourable: "border-hairline-strong text-snow",
  mixed: "border-hairline-strong text-mist",
  poor: "border-alert/35 text-alert",
  unknown: "border-hairline text-mist-dim",
};

function RatingPill({ rating }: { rating: WindowRating }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]",
        RATING_TONE[rating],
      )}
    >
      {rating}
    </span>
  );
}

function DayCard({ day, today }: { day: RatedDay; today: string }) {
  const f = day.forecast;

  return (
    <div className="rounded-tile border border-hairline p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] text-snow">{dayLabel(day.date)}</p>
          {day.date === today && <p className="section-label mt-1 text-[9px]">Today</p>}
        </div>
        <RatingPill rating={day.rating} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="min-w-0">
          <p className="section-label text-[9px]">Max / min</p>
          <p className="mt-1.5 text-[13px]">
            <InlineReading reading={f.maxC} format={tempCoarse} />
            <span className="mx-1 text-mist-dim">/</span>
            <InlineReading reading={f.minC} format={tempCoarse} />
          </p>
        </div>
        <div className="min-w-0">
          <p className="section-label text-[9px]">Wind max</p>
          <p className="mt-1.5 text-[13px]">
            <InlineReading reading={f.windMaxKph} format={kph} unit="km/h" />
          </p>
        </div>
        <div className="min-w-0">
          <p className="section-label text-[9px]">New snow</p>
          <p className="mt-1.5 text-[13px]">
            <InlineReading reading={f.snowfallCm} format={(v) => v.toFixed(0)} unit="cm" />
          </p>
        </div>
      </div>

      {/* A rating is never a colour on its own — the reasons behind it ship
          with it, so the athlete can disagree with the arithmetic. */}
      <ul className="mt-3 space-y-1 border-t border-hairline pt-3">
        {day.notes.map((note) => (
          <li key={note} className="text-[11px] leading-relaxed text-mist-dim">
            {note}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Alerts                                                                     */
/* -------------------------------------------------------------------------- */

interface ConditionAlert {
  id: string;
  title: string;
  body: string;
}

const SEVERITY: Record<WindowRating, number> = { unknown: 0, favourable: 1, mixed: 2, poor: 3 };

/**
 * Alerts derived from the forecast, never from a rule of thumb.
 *
 * Every one names the figures it came from, and none of them is an
 * instruction: no "postpone", no "move your date", no "conditions are good".
 * The strongest thing this screen may say is that something is worth looking
 * at in the local mountain forecast and avalanche bulletin — sources written
 * by people who are on that mountain, which ICEFALL is not.
 */
function buildAlerts(days: RatedDay[], targetDate?: string): ConditionAlert[] {
  const out: ConditionAlert[] = [];
  if (days.length === 0) return out;

  for (let i = 0; i < days.length - 1; i++) {
    const a = days[i].forecast.windMaxKph.value;
    const b = days[i + 1].forecast.windMaxKph.value;
    if (a === null || b === null) continue;
    if (b - a >= 20) {
      out.push({
        id: "wind-rising",
        title: "Wind rising",
        body: `Modelled maximum wind goes from ${Math.round(a)} km/h on ${dayLabel(days[i].date)} to ${Math.round(b)} km/h on ${dayLabel(days[i + 1].date)}.`,
      });
      break;
    }
  }

  for (let i = 0; i < days.length - 1; i++) {
    const a = days[i].forecast.maxC.value;
    const b = days[i + 1].forecast.maxC.value;
    if (a === null || b === null) continue;
    if (a - b >= 8) {
      out.push({
        id: "temp-drop",
        title: "Sharp temperature drop",
        body: `Modelled daytime maximum falls from ${tempInProse(a)} °C on ${dayLabel(days[i].date)} to ${tempInProse(b)} °C on ${dayLabel(days[i + 1].date)}.`,
      });
      break;
    }
  }

  const snowy = days.find((d) => (d.forecast.snowfallCm.value ?? 0) >= 15);
  if (snowy) {
    out.push({
      id: "new-snow",
      title: "Significant new snow modelled",
      body: `${Math.round(snowy.forecast.snowfallCm.value as number)} cm on ${dayLabel(snowy.date)}. The local avalanche bulletin is the source for what that means on this terrain.`,
    });
  }

  if (targetDate) {
    const key = isoDate(new Date(targetDate));
    const target = days.find((d) => d.date === key);
    if (target && SEVERITY[target.rating] >= 2) {
      // The comparison is against the days ICEFALL can actually see, and it is
      // phrased as an observation. Suggesting the athlete move their date would
      // be a mountain decision, and those are not made here.
      const better = days
        .filter((d) => d.date !== target.date && SEVERITY[d.rating] > 0)
        .filter((d) => SEVERITY[d.rating] < SEVERITY[target.rating])
        .sort((a, b) => SEVERITY[a.rating] - SEVERITY[b.rating])[0];
      if (better) {
        out.push({
          id: "target-day",
          title: "Your target date reads worse than nearby days",
          body: `${dayLabel(target.date)} is modelled as ${target.rating}, while ${dayLabel(better.date)} is modelled as ${better.rating}. This is decision support only — review the local mountain forecast and avalanche bulletin.`,
        });
      }
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

interface Peak {
  name: string;
  subtitle?: string;
  elevationM?: number;
  lat?: number;
  lon?: number;
  targetDate?: string;
  backTo: string;
}

type ForecastTab = "today" | "48h" | "week" | "window";

const TABS: readonly { value: ForecastTab; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "48h", label: "48 hours" },
  { value: "week", label: "7 days" },
  { value: "window", label: "Expedition" },
];

export default function Conditions() {
  const { goalId } = useParams<{ goalId: string }>();
  const { goals, objectives, can } = useApp();

  /**
   * The route is keyed on a goal, but the same mountain can be a saved
   * objective with no date attached. Both resolve; a peak with no coordinates
   * resolves to a peak that cannot be forecast, which is stated rather than
   * filled in from somewhere plausible.
   */
  const peak = useMemo<Peak | null>(() => {
    const goal = goals.find((g) => g.id === goalId);
    if (goal) {
      const curated = goal.mountainId ? sync.mountainById(goal.mountainId) : undefined;
      return {
        name: goal.name,
        subtitle: goal.subtitle,
        elevationM: goal.elevationM ?? curated?.elevationM,
        lat: goal.lat ?? curated?.coords.lat,
        lon: goal.lon ?? curated?.coords.lon,
        targetDate: goal.targetDate,
        backTo: `/goals/${goal.id}`,
      };
    }

    const objective = objectives.find((o) => o.id === goalId);
    if (objective) {
      return {
        name: objective.name,
        elevationM: objective.elevationM,
        lat: objective.lat,
        lon: objective.lon,
        backTo: "/explore",
      };
    }

    return null;
  }, [goalId, goals, objectives]);

  const pro = can(PRO_FEATURE);

  const [data, setData] = useState<MountainConditions | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<ForecastTab>("today");

  const name = peak?.name;
  const elevationM = peak?.elevationM;
  const lat = peak?.lat;
  const lon = peak?.lon;

  useEffect(() => {
    if (name === undefined || elevationM === undefined || lat === undefined || lon === undefined) {
      setLoading(false);
      return;
    }

    let alive = true;
    const controller = new AbortController();
    setLoading(true);

    // Bands cost one request each, so they are only asked for when the athlete
    // can see them. `getMountainConditions` never throws; the catch is here so
    // an aborted or exotic failure still leaves a stated absence behind rather
    // than a spinner that never resolves.
    void getMountainConditions({
      peakName: name,
      elevationM,
      lat,
      lon,
      includeBands: pro,
      signal: controller.signal,
    })
      .then((result) => {
        if (!alive) return;
        setData(result);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [name, elevationM, lat, lon, pro, attempt]);

  const rated = useMemo<RatedDay[]>(() => (data?.daily ?? []).map(rateDay), [data]);
  const alerts = useMemo(() => buildAlerts(rated, peak?.targetDate), [rated, peak?.targetDate]);
  const today = isoDate(new Date());

  if (!peak) {
    return (
      <Screen>
        <ScreenHeader title="Conditions" back="/goals" />
        <Card>
          <p className="text-[14px] text-snow">This objective could not be found.</p>
          <p className="mt-2 text-[12px] leading-relaxed text-mist">
            The link may be out of date, or the objective may have been removed.
          </p>
          <Link to="/goals" className="mt-4 inline-block">
            <Button variant="secondary" size="sm">
              Back to objectives
            </Button>
          </Link>
        </Card>
      </Screen>
    );
  }

  const forecastable = elevationM !== undefined && lat !== undefined && lon !== undefined;
  const current = data?.current;
  const failed = !loading && (data === null || Boolean(data.error));

  const subtitleParts = [
    elevationM !== undefined ? `${fmtElevation(elevationM)} m` : "Elevation unknown",
    peak.targetDate ? `Target ${fmtDate(peak.targetDate)}` : "No target date set",
  ];

  return (
    <Screen>
      <ScreenHeader title={peak.name} subtitle={subtitleParts.join(" · ")} back={peak.backTo} />

      <Stagger>
        {peak.targetDate && (
          <Rise>
            <p className="section-label">{fmtCountdown(peak.targetDate)}</p>
          </Rise>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Current conditions                                               */}
        {/* ---------------------------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Current conditions · Summit</SectionLabel>

          {!forecastable ? (
            <Card className="mt-3">
              <p className="text-[13px] leading-relaxed text-snow">
                ICEFALL does not have coordinates for this objective, so it cannot request a
                forecast for it.
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
                Nothing on this screen is estimated from a nearby peak — that would be a forecast
                for a different mountain.
              </p>
            </Card>
          ) : loading ? (
            <Card className="mt-3">
              <p className="text-[13px] text-snow">Requesting the forecast for {peak.name}.</p>
              <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
                No figures are shown until they arrive.
              </p>
            </Card>
          ) : (
            <>
              {failed && (
                <Card className="mt-3 border-alert/25">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-alert" aria-hidden="true">
                      <TriangleAlert size={15} strokeWidth={1.7} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-snow">The forecast could not be loaded.</p>
                      <p className="mt-2 text-[12px] leading-relaxed text-mist">
                        Nothing below is current. An empty weather panel looks exactly like a calm
                        mountain, so ICEFALL says plainly that it has no data rather than leaving
                        the space blank.
                      </p>
                      {data?.error && (
                        <p className="tnum mt-2 text-[11px] text-mist-dim">Reason: {data.error}</p>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-3"
                        onClick={() => setAttempt((n) => n + 1)}
                      >
                        <RotateCw size={13} strokeWidth={1.8} />
                        Try again
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              <Card className="mt-3">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="section-label">Temperature</p>
                    {current && current.temperatureC.value !== null ? (
                      <p className="tnum mt-2.5 text-[52px] font-extralight leading-none tracking-[-0.02em] text-snow">
                        {tempValue(current.temperatureC.value)}
                        <span className="ml-1.5 align-top text-[15px] font-light text-mist">
                          °C
                        </span>
                      </p>
                    ) : (
                      <div className="mt-3">
                        <UnavailableState
                          reason={current?.temperatureC.reason ?? "no-data"}
                          size="md"
                          className="items-start text-left"
                        />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="section-label">Feels like</p>
                    <p className="mt-2.5 text-[16px]">
                      <InlineReading reading={current?.feelsLikeC} format={tempValue} unit="°C" />
                    </p>
                  </div>
                </div>

                {current && !failed && (
                  <p className="mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
                    Modelled for {fmtTime(current.observedAt)} local time at the peak, at{" "}
                    {elevationM !== undefined ? `${fmtElevation(elevationM)} m` : "the summit"}.
                  </p>
                )}
              </Card>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <ReadingTile
                  icon={Wind}
                  label="Wind"
                  reading={current?.windKph}
                  format={kph}
                  unit="km/h"
                  caption="Modelled 10 m above ground"
                />
                {/* Speed and direction are separate readings and fail
                    separately: a known speed with an unknown bearing must show
                    the speed and say the bearing is missing, not drop both. */}
                <ReadingTile
                  icon={Compass}
                  label="Direction"
                  reading={current?.windDirectionDeg}
                  format={bearing}
                  caption="Direction the wind comes from"
                />
                {/* PROVENANCE, and it is not the same for every tile.
                    Temperature, feels-like, wind and precipitation come from
                    the provider's `current` block. Visibility and the freezing
                    level come from the hourly series, which the service now
                    indexes to the hour nearest local time — it previously read
                    entry 0 (00:00 today) and captioned it as current. On the
                    day that was fixed, midnight visibility read 3,100 m against
                    340 m for the actual hour, which is the sort of difference
                    someone reads before leaving a hut. */}
                <ReadingTile
                  icon={Eye}
                  label="Visibility"
                  reading={current?.visibilityM}
                  format={visibility}
                  caption="Modelled for the current hour"
                />
                <ReadingTile
                  icon={Droplets}
                  label="Precipitation"
                  reading={current?.precipitationMm}
                  format={(v) => v.toFixed(1)}
                  unit="mm"
                  caption="Current hour"
                />
              </div>
            </>
          )}
        </Rise>

        {/* ---------------------------------------------------------------- */}
        {/* Freezing level                                                   */}
        {/* ---------------------------------------------------------------- */}
        {forecastable && !loading && (
          <Rise className="pt-6">
            <SectionLabel>Freezing level</SectionLabel>
            <FreezingLevel reading={current?.freezingLevelM} summitM={elevationM} />
          </Rise>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Elevation breakdown — Pro                                        */}
        {/* ---------------------------------------------------------------- */}
        {forecastable && elevationM !== undefined && (
          <Rise className="pt-6">
            <SectionLabel>Elevation breakdown</SectionLabel>

            {pro ? (
              <Card className="mt-3" inset={false}>
                {loading ? (
                  <p className="p-4 text-[13px] text-mist">Requesting each elevation.</p>
                ) : data && data.bands.length > 0 ? (
                  <ul>
                    {data.bands.map((band) => (
                      <li
                        key={band.elevationM}
                        className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3.5 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="text-[14px] text-snow">{band.label}</p>
                          {/* The numeric bands are already labelled with their
                              height; only "Summit" needs its height spelling
                              out underneath. */}
                          {band.label === "Summit" && (
                            <p className="tnum mt-1 text-[11px] text-mist-dim">
                              {fmtElevation(band.elevationM)} m
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-6 text-right">
                          <div>
                            <p className="section-label text-[9px]">Temp</p>
                            <p className="mt-1.5 text-[14px]">
                              <InlineReading reading={band.temperatureC} format={tempC} />
                            </p>
                          </div>
                          <div>
                            <p className="section-label text-[9px]">Wind</p>
                            <p className="mt-1.5 text-[14px]">
                              <InlineReading reading={band.windKph} format={kph} unit="km/h" />
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-5">
                    <UnavailableState reason="no-data" size="md" className="mx-auto" />
                  </div>
                )}

                <p className="border-t border-hairline p-4 text-[11px] leading-relaxed text-mist-dim">
                  Each band is a separate forecast request at that elevation — modelled per
                  elevation, not a lapse rate applied to the summit figure on this device. Models
                  smooth real terrain, so a band is an approximation of the mountain, not a
                  measurement on it.
                </p>
              </Card>
            ) : (
              <Card className="mt-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-mist-dim" aria-hidden="true">
                    <Layers size={15} strokeWidth={1.6} />
                  </span>
                  <p className="text-[13px] leading-relaxed text-mist">
                    Temperature and wind modelled separately at{" "}
                    <span className="tnum text-snow">{bandsFor(elevationM).length}</span> elevations
                    on this mountain, from the approach to the summit.
                  </p>
                </div>
                <UpgradePrompt
                  featureId={PRO_FEATURE}
                  title="The elevation breakdown is part of ICEFALL Pro."
                  body="Each band is requested from the forecast at its own height, so the figures describe the climb rather than the summit alone."
                  className="mt-4"
                />
              </Card>
            )}
          </Rise>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Forecast                                                         */}
        {/* ---------------------------------------------------------------- */}
        {forecastable && (
          <Rise className="pt-6">
            <SectionLabel>Forecast</SectionLabel>
            <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} className="mt-3" />

            <div className="mt-4">
              {loading ? (
                <Card>
                  <p className="text-[13px] text-mist">Requesting the forecast.</p>
                </Card>
              ) : (
                <ForecastPanel
                  tab={tab}
                  rated={rated}
                  data={data}
                  pro={pro}
                  today={today}
                  targetDate={peak.targetDate}
                />
              )}
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
              Favourable, mixed and poor describe the modelled weather and nothing else. They are
              not a recommendation, not permission, and not a judgement of whether the objective is
              on.
            </p>
          </Rise>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Alerts                                                           */}
        {/* ---------------------------------------------------------------- */}
        {forecastable && !loading && (
          <Rise className="pt-6">
            <SectionLabel>Worth noting</SectionLabel>

            {rated.length === 0 ? (
              <Card className="mt-3">
                <UnavailableState reason="no-data" size="md" className="mx-auto" />
                <p className="mt-3 text-center text-[11px] leading-relaxed text-mist-dim">
                  With no forecast, there is nothing to derive notes from.
                </p>
              </Card>
            ) : alerts.length === 0 ? (
              <Card className="mt-3">
                <p className="text-[13px] leading-relaxed text-mist">
                  Nothing notable in the modelled figures for the days available. That is a
                  statement about the model, not about the mountain.
                </p>
              </Card>
            ) : (
              <div className="mt-3 space-y-2.5">
                {alerts.map((alert) => (
                  <Card key={alert.id}>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0 text-alert/80" aria-hidden="true">
                        <TriangleAlert size={14} strokeWidth={1.7} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] text-snow">{alert.title}</p>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{alert.body}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Rise>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Framing — never optional                                         */}
        {/* ---------------------------------------------------------------- */}
        <Rise className="pt-6">
          <Disclaimer>{CONDITIONS_DISCLAIMER}</Disclaimer>
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{CONDITIONS_ATTRIBUTION}</p>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Freezing level                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The freezing level, given the prominence it earns on a mountain.
 *
 * Where the 0 °C isotherm sits relative to the summit is the single figure that
 * most changes what the ground is doing — whether snow is bonding or running,
 * whether an overnight refreeze is likely, whether rock is held together by ice
 * or by nothing. So it is stated in words as well as metres.
 *
 * The words describe the physics and stop there. They do not say the mountain
 * is in condition, and they do not say it is out.
 */
function FreezingLevel({ reading, summitM }: { reading?: Reading; summitM?: number }) {
  if (!reading || reading.value === null) {
    return (
      <Card className="mt-3">
        <UnavailableState reason={reading?.reason ?? "no-data"} size="md" className="mx-auto" />
        <p className="mt-3 text-center text-[11px] leading-relaxed text-mist-dim">
          Without a freezing level, ICEFALL cannot say whether the summit is above or below zero.
        </p>
      </Card>
    );
  }

  const level = reading.value;
  const known = summitM !== undefined;
  const below = known && level < summitM;
  const difference = known ? Math.abs(Math.round(level - summitM)) : null;

  return (
    <Card className="mt-3">
      <div className="flex items-start gap-4">
        <span className="mt-1 shrink-0 text-mist-dim" aria-hidden="true">
          {below ? (
            <Snowflake size={16} strokeWidth={1.6} />
          ) : (
            <Thermometer size={16} strokeWidth={1.6} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="tnum text-[34px] font-extralight leading-none tracking-[-0.02em] text-snow">
            {fmtElevation(level)}
            <span className="ml-1.5 text-[14px] font-light text-mist">m</span>
          </p>

          {known ? (
            <p className="mt-3 text-[13px] leading-relaxed text-snow">
              {below
                ? `The freezing level sits ${difference?.toLocaleString("en-GB")} m below the summit.`
                : `The freezing level sits ${difference?.toLocaleString("en-GB")} m above the summit.`}
            </p>
          ) : (
            <p className="mt-3 text-[13px] leading-relaxed text-snow">
              The summit height is unknown, so ICEFALL cannot say where this sits relative to it.
            </p>
          )}

          {known && (
            <p className="mt-2 text-[12px] leading-relaxed text-mist">
              {below
                ? "Above that height the modelled air temperature is below zero: snow and ice are more likely to stay frozen and a refreeze overnight is more likely. Below it, softening snow and running meltwater are more likely."
                : "The whole mountain is modelled above freezing. Snow softens through the day, meltwater runs, and an overnight refreeze is less certain."}
            </p>
          )}

          <p className="mt-3 border-t border-hairline pt-3 text-[11px] leading-relaxed text-mist-dim">
            The freezing level is the modelled height of the 0 °C isotherm, taken from the first
            hourly value of today rather than the current hour. It is a model output rather than a
            measurement on the mountain, it moves through the day — often by several hundred metres
            — and aspect and shade change what the ground actually does.
          </p>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Forecast panels                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The quiet lock. Inline, no modal, no popup, and the section it belongs to
 * stays visible — nobody should have to guess whether ICEFALL has this at all.
 *
 * `summary` says what the section holds; `body` is the honest limit of what
 * upgrading actually buys. Selling a seven-day model as though it answered a
 * question eight months out would be the dishonest version of this component.
 */
function LockedPanel({ title, summary, body }: { title: string; summary: string; body: string }) {
  return (
    <Card>
      <p className="text-[13px] leading-relaxed text-mist">{summary}</p>
      <UpgradePrompt featureId={PRO_FEATURE} title={title} body={body} className="mt-4" />
    </Card>
  );
}

function DayList({ days, today }: { days: RatedDay[]; today: string }) {
  return (
    <div className="space-y-2.5">
      {days.map((day) => (
        <DayCard key={day.date} day={day} today={today} />
      ))}
    </div>
  );
}

function NoForecast({ line }: { line: string }) {
  return (
    <Card>
      <UnavailableState reason="no-data" size="md" className="mx-auto" />
      <p className="mt-3 text-center text-[11px] leading-relaxed text-mist-dim">{line}</p>
    </Card>
  );
}

function ForecastPanel({
  tab,
  rated,
  data,
  pro,
  today,
  targetDate,
}: {
  tab: ForecastTab;
  rated: RatedDay[];
  data: MountainConditions | null;
  pro: boolean;
  today: string;
  targetDate?: string;
}) {
  if (tab === "today") {
    const day = rated.find((d) => d.date === today) ?? rated[0];
    return day ? (
      <DayList days={[day]} today={today} />
    ) : (
      <NoForecast line="Today's forecast could not be loaded." />
    );
  }

  if (tab === "48h") {
    const days = rated.slice(0, 2);
    return days.length > 0 ? (
      <DayList days={days} today={today} />
    ) : (
      <NoForecast line="The next two days could not be loaded." />
    );
  }

  if (tab === "week") {
    if (!pro) {
      return (
        <LockedPanel
          title="The seven-day view is part of ICEFALL Pro."
          summary="Seven days of modelled conditions, each with the wind, new snow and temperatures behind its rating."
          body="Seven days is as far as the forecast model reaches — beyond that, ICEFALL has nothing to show and will say so."
        />
      );
    }
    return rated.length > 0 ? (
      <DayList days={rated} today={today} />
    ) : (
      <NoForecast line="The seven-day forecast could not be loaded." />
    );
  }

  // Expedition window.
  if (!pro) {
    return (
      <LockedPanel
        title="The expedition window is part of ICEFALL Pro."
        summary="The days around your target date, rated individually, with the figures behind each rating."
        body="It fills in only once your target date falls inside the seven-day forecast range. Until then there is nothing to show, and ICEFALL will not put a seasonal average there instead."
      />
    );
  }

  if (!targetDate) {
    return (
      <Card>
        <p className="text-[13px] leading-relaxed text-snow">
          This objective has no target date, so there is no window to look at.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
          Set one on the objective and the days around it appear here once they fall inside the
          forecast range.
        </p>
      </Card>
    );
  }

  const target = new Date(targetDate);
  // The window is stated explicitly rather than guessed: ICEFALL does not know
  // the athlete's itinerary, and inventing a summit day would be a fabrication
  // dressed as planning.
  const from = new Date(target);
  from.setDate(from.getDate() - 1);
  const to = new Date(target);
  to.setDate(to.getDate() + 2);

  const days = data ? rateWindow(data.daily, from.toISOString(), to.toISOString()) : [];

  if (days.length === 0) {
    return (
      <Card>
        <p className="text-[13px] leading-relaxed text-snow">
          Your target date is {fmtDate(targetDate)} — {fmtCountdown(targetDate).toLowerCase()}.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-mist">
          Forecast models reach seven days ahead. There is nothing to show for that window yet, and
          a seasonal average would not be a forecast. This fills in as the date approaches.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <p className="mb-3 text-[11px] leading-relaxed text-mist-dim">
        Your target date, the day before and the two days after. ICEFALL does not know your
        itinerary, so this is a window around the date rather than a summit plan.
      </p>
      <DayList days={days} today={today} />
    </div>
  );
}
