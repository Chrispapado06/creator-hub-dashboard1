/**
 * Mountain conditions, from real forecast data.
 *
 * Source: Open-Meteo (https://open-meteo.com) — no API key, and it accepts an
 * `elevation` parameter, which is the whole reason it was chosen. Asking for
 * Mont Blanc's coordinates at 1,000 m and at 4,806 m returns genuinely
 * different weather (21°C against −4°C on the day this was written), so the
 * elevation breakdown this module exposes is real downscaling rather than a
 * lapse rate invented on the client.
 *
 * ⚠️ LICENSING: Open-Meteo's free tier is for NON-COMMERCIAL use. ICEFALL
 * intends to charge for Pro. Before this ships behind a paid plan, either move
 * to their commercial tier or swap the provider — the interface below is the
 * seam for that, and nothing above it needs to change.
 *
 * HONESTY RULES THIS MODULE ENFORCES:
 *   - Every reading is a value or an explicit absence. A missing figure is
 *     never rendered as zero, and a failed request never becomes "calm and
 *     clear" by default.
 *   - Nothing here tells anyone to climb or not to climb. Window ratings are
 *     decision support and are labelled as such; the call belongs to the
 *     climber and their guide.
 */

import type { Unavailable } from "@/coach/types";
import { CONDITIONS_TIMEOUT_MS, withTimeout } from "@/lib/netTimeout";
import { OFFLINE } from "@/offline/offline";
import { offlineConditions } from "@/offline/fixtures";

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

export const CONDITIONS_ATTRIBUTION =
  "Forecast data from Open-Meteo, derived from national weather services.";

export const CONDITIONS_DISCLAIMER =
  "A forecast is not a decision. ICEFALL reports what the models say and never tells you whether to climb — mountain weather turns faster than any model resolves it, and the call belongs to you and your guide. Check the local mountain forecast and avalanche bulletin before committing.";

/** A single figure that may be absent, with the reason it is. */
export interface Reading<T = number> {
  value: T | null;
  reason?: Unavailable;
}

const got = <T>(v: T | null | undefined): Reading<T> =>
  v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))
    ? { value: null, reason: "no-data" }
    : { value: v as T };

export interface CurrentConditions {
  temperatureC: Reading;
  feelsLikeC: Reading;
  windKph: Reading;
  windDirectionDeg: Reading;
  /** Metres. */
  visibilityM: Reading;
  precipitationMm: Reading;
  /** Metres above sea level. Below the summit means the summit is freezing. */
  freezingLevelM: Reading;
  /**
   * WMO weather code — the condition itself, for an icon and a word.
   *
   * ⚠️ ZERO IS A CODE, NOT AN ABSENCE: 0 means "clear sky". `!weatherCode.value`
   * is therefore a bug that turns clear weather into unknown weather. Test
   * `.value === null`. When it IS null, draw no icon and print no condition
   * word — an unread code must never fall back to "Clear".
   */
  weatherCode: Reading;
  /** Daylight AT THE PEAK, for choosing a sun or a moon. null when unknown. */
  isDay: boolean | null;
  observedAt: string;
}

export interface DayForecast {
  date: string;
  maxC: Reading;
  minC: Reading;
  windMaxKph: Reading;
  precipitationMm: Reading;
  snowfallCm: Reading;
  sunrise?: string;
  sunset?: string;
}

/* -------------------------------------------------------------------------- */
/* The hours ahead                                                            */
/* -------------------------------------------------------------------------- */

/** How many hours ahead the outlook carries unless a caller asks for more. */
export const HOURLY_OUTLOOK_HOURS = 6;

/** One hour of the forecast, on the mountain, in the mountain's own time. */
export interface HourReading {
  /**
   * Open-Meteo's own stamp for this hour, e.g. "2026-09-03T16:00".
   *
   * ⚠️ NAIVE AND LOCAL TO THE PEAK — there is no offset in the string, so
   * `new Date(time)` reads it as the VIEWER's local time and is wrong by the
   * distance between the two clocks. Use `hour` and `label`, which are already
   * the mountain's. This module has a recorded history of exactly that bug;
   * see `nowIdx` below for the last one.
   */
  time: string;
  /** 0–23, local to the PEAK — never the phone's. */
  hour: number;
  /** "4 PM", already in the mountain's local time. Ready to render. */
  label: string;
  temperatureC: Reading;
  /** WMO code. Zero means clear sky; null means unknown — never draw a default. */
  weatherCode: Reading;
  /** Daylight at the peak for this hour. null when unknown. */
  isDay: boolean | null;
  /**
   * The hour CONTAINING this instant on the mountain — the one in progress, not
   * the one nearest. First in the list when it is there at all, and false on
   * every hour of an outlook whose series does not reach the present. Nothing
   * else may be labelled "Now".
   */
  isNow: boolean;
}

/** Why an outlook carries fewer hours than were asked for. */
export type HourlyShortfall =
  | "request-failed"
  | "no-series"
  /** A series came back, but every hour in it is already behind us. */
  | "past-series"
  | "short-series";

/**
 * The hours ahead, and — when there are fewer than asked for — the reason.
 *
 * `hours` is what was actually forecast, starting at the hour current on the
 * mountain. It is NEVER padded: no interpolation across a gap, no repeat of the
 * current temperature, no placeholder ramp. Six plausible temperatures nobody
 * modelled would look exactly like a forecast, which is the one thing this
 * cannot do. Fewer hours, or none, with `note` said out loud instead.
 */
export interface HourlyOutlook {
  hours: HourReading[];
  /** How many hours were asked for, so a caller can see what is missing. */
  requested: number;
  /** Absent when the full window came back. */
  shortfall?: HourlyShortfall;
  /** Plain English, ready to render verbatim. Absent when nothing is missing. */
  note?: string;
}

/* -------------------------------------------------------------------------- */

/** One elevation band on the mountain. */
export interface ElevationBand {
  elevationM: number;
  label: string;
  temperatureC: Reading;
  windKph: Reading;
}

export interface MountainConditions {
  peakName: string;
  elevationM: number;
  current: CurrentConditions;
  /** The hours ahead. Always present; may legitimately carry no hours at all. */
  hourly: HourlyOutlook;
  daily: DayForecast[];
  bands: ElevationBand[];
  /** Set when the whole request failed; every reading will be absent. */
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Weather codes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The coarse family a WMO code belongs to — one of seven, which is as many
 * icons as a six-column strip can carry and still be read at a glance.
 */
export type WeatherKind =
  | "clear"
  | "cloud"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder";

/**
 * WMO 4677 code → icon family, or null for a code this app does not know.
 *
 * Null is the point. An unrecognised code returns nothing so the caller draws
 * nothing; it must never collapse to "clear", which would turn a code ICEFALL
 * failed to read into a claim of good weather on a mountain.
 */
export function weatherKind(code: number | null | undefined): WeatherKind | null {
  if (code === null || code === undefined || !Number.isFinite(code)) return null;
  if (code === 0 || code === 1) return "clear";
  if (code === 2 || code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  /*
   * 80/81/82 are ONE family — rain showers, slight/moderate/violent. 80 sat in
   * the drizzle branch, which split the family across two glyphs and, worse,
   * drew a drizzle icon beside this module's own word for it: `describeWeatherCode(80)`
   * is "Light showers". The picture and the word have to agree.
   */
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "thunder";
  return null;
}

/** The WMO wording, one word or two. Null for a code this app does not know. */
export function describeWeatherCode(code: number | null | undefined): string | null {
  if (code === null || code === undefined || !Number.isFinite(code)) return null;
  const words: Record<number, string> = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with hail",
  };
  return words[code] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                   */
/* -------------------------------------------------------------------------- */

interface RawForecast {
  elevation?: number;
  /**
   * Seconds the PEAK's timezone is ahead of UTC. Requested implicitly by
   * `timezone=auto` and required to read the hourly series correctly — see
   * `nowIdx` below.
   */
  utc_offset_seconds?: number;
  current?: Record<string, number | string>;
  hourly?: Record<string, (number | null)[] | string[]>;
  daily?: Record<string, (number | null)[] | string[]>;
}

/**
 * One forecast request.
 *
 * `slim` is for the elevation bands, which read two numbers out of `current`
 * and nothing else. They used to pay for a week of daily figures and two hourly
 * series each, four times over, and discard all of it; now that the hourly list
 * is three variables longer that waste is worth not repeating.
 */
async function fetchForecast(
  lat: number,
  lon: number,
  elevationM: number,
  signal?: AbortSignal,
  slim = false,
): Promise<RawForecast> {
  const params = new URLSearchParams(
    slim
      ? {
          latitude: lat.toFixed(4),
          longitude: lon.toFixed(4),
          elevation: String(Math.round(elevationM)),
          current: "temperature_2m,wind_speed_10m",
          forecast_days: "1",
          timezone: "auto",
        }
      : {
          latitude: lat.toFixed(4),
          longitude: lon.toFixed(4),
          elevation: String(Math.round(elevationM)),
          current:
            "temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,precipitation,weather_code,is_day",
          /*
           * `time` is returned alongside automatically.
           *
           * `temperature_2m,weather_code,is_day` are the hour-by-hour strip:
           * a temperature to print, a code to pick an icon and a word from, and
           * daylight so 2 AM does not get a sun. All three ride in THIS request
           * — a second round trip for the same forecast would be a second thing
           * to fail, on a phone that may be on a col with one bar.
           */
          hourly:
            "temperature_2m,weather_code,is_day,freezing_level_height,visibility",
          daily:
            "temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum,snowfall_sum,sunrise,sunset",
          forecast_days: "7",
          timezone: "auto",
        },
  );

  const res = await fetch(`${ENDPOINT}?${params}`, {
    signal: withTimeout(CONDITIONS_TIMEOUT_MS, signal),
  });
  if (!res.ok) throw new Error(`forecast ${res.status}`);
  return (await res.json()) as RawForecast;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Open-Meteo sends daylight as 1/0. Anything else is unknown, not "night". */
const flag = (v: unknown): boolean | null => (v === 1 ? true : v === 0 ? false : null);

/**
 * The hour out of a naive local stamp, "2026-09-03T16:00" → 16.
 *
 * Read as two characters rather than parsed as a date ON PURPOSE. The stamp
 * carries no offset, so every Date-based reading of it is the viewer's clock
 * wearing the mountain's label. Slicing cannot make that mistake.
 *
 * The digit test is not decoration: `Number("")` is 0, so a truncated stamp
 * would otherwise pass as a confident midnight.
 */
const localHourOf = (stamp: string | undefined): number | null => {
  if (typeof stamp !== "string" || stamp.length < 13) return null;
  const hh = stamp.slice(11, 13);
  if (!/^\d{2}$/.test(hh)) return null;
  const h = Number(hh);
  return h >= 0 && h <= 23 ? h : null;
};

/**
 * "2026-09-03T22:45" → "22:45", the clock ON THE MOUNTAIN. Null if it cannot be
 * read as one.
 *
 * SLICED, NEVER PARSED, for the same reason `localHourOf` is: Open-Meteo's
 * stamps carry no offset, so `new Date(stamp)` reads them on the VIEWER's clock
 * and hands back digits that belong to neither place.
 *
 * The zone test is the other half. A stamp that DOES carry a zone — the
 * `new Date().toISOString()` this module falls back to when a response arrives
 * without its own time — is an instant in UTC, and slicing its characters would
 * caption UTC as the peak's local time. Anything with a Z or an offset is
 * refused, and the caller shows nothing rather than a plausible wrong hour.
 */
export function peakLocalClock(stamp: string | undefined): string | null {
  if (typeof stamp !== "string" || stamp.length < 16) return null;
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(stamp)) return null;
  const hhmm = stamp.slice(11, 16);
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(3, 5));
  return h <= 23 && m <= 59 ? hhmm : null;
}

/** 16 → "4 PM". Built from the mountain's hour, so it reads as the mountain's. */
const hourLabelFor = (hour: number): string =>
  `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`;

const NO_HOURLY_NOTE = "No hourly forecast came back for this peak.";
const HOURLY_FAILED_NOTE = "The hourly forecast could not be loaded.";
const PAST_HOURLY_NOTE = "The hourly forecast on hand ends before now.";

/** One hour, in milliseconds. */
const HOUR_MS = 3_600_000;

/** An outlook carrying nothing, with the reason it carries nothing. */
const noOutlook = (requested: number, shortfall: HourlyShortfall): HourlyOutlook => ({
  hours: [],
  requested,
  shortfall,
  note:
    shortfall === "request-failed"
      ? HOURLY_FAILED_NOTE
      : shortfall === "past-series"
        ? PAST_HOURLY_NOTE
        : NO_HOURLY_NOTE,
});

/**
 * The hours ahead, starting at the hour IN PROGRESS on the mountain.
 *
 * Open-Meteo returns the whole day from midnight, so roughly half the series is
 * already in the past by mid-afternoon; the window starts at `startIdx` and runs
 * forward. It stops when the series does. It never fills.
 *
 * TWO INDICES, ON PURPOSE. `startIdx` is where the window opens. `currentIdx`
 * is the one column entitled to call itself "Now", and it is −1 when no hour in
 * the series contains this instant — a response that begins later today, or one
 * held past its own end. A window can legitimately open on a real future hour
 * with no "Now" in it at all; what it must never do is pin the word onto the
 * nearest hour to hand.
 *
 * A single null temperature inside the window is kept as an hour with no
 * temperature — the hour is real, the reading is missing, and dropping it would
 * silently slide 8 PM into 7 PM's place. Only when NOTHING in the window was
 * modelled does the outlook go empty and say so, because six em dashes in a row
 * is not a forecast either.
 */
function buildOutlook(
  hourly: Record<string, (number | null)[] | string[]>,
  times: string[],
  startIdx: number,
  currentIdx: number,
  requested: number,
): HourlyOutlook {
  const temps = hourly.temperature_2m as (number | null)[] | undefined;
  if (times.length === 0 || !temps || temps.length === 0)
    return noOutlook(requested, "no-series");

  // A series exists but holds no hour at or after this instant. Not "no
  // forecast came back" — a forecast came back and it has run out, which is a
  // different sentence and the reader deserves the accurate one.
  if (startIdx < 0) return noOutlook(requested, "past-series");

  const codes = hourly.weather_code as (number | null)[] | undefined;
  const daylight = hourly.is_day as (number | null)[] | undefined;

  /*
   * The window cannot outrun the temperatures. Past the end of that array every
   * further hour would be a labelled column with a dash in it — not padding,
   * but not a forecast either, and the outlook would call itself complete while
   * half of it said nothing. Running out of series is a SHORT series, and the
   * note below is how it says so. A null at an index that EXISTS is different:
   * that is a gap in a forecast that was made, and it is kept.
   */
  const end = Math.min(times.length, temps.length);

  const hours: HourReading[] = [];
  for (let i = startIdx; i < end && hours.length < requested; i++) {
    const stamp = times[i];
    const hour = localHourOf(stamp);
    // An hour that cannot be labelled in the mountain's time cannot be shown at
    // all; stop the window rather than guess at it or skip a column.
    if (hour === null) break;
    hours.push({
      time: stamp,
      hour,
      label: hourLabelFor(hour),
      temperatureC: got(num(temps[i])),
      weatherCode: got(num(codes?.[i])),
      isDay: flag(daylight?.[i]),
      isNow: i === currentIdx,
    });
  }

  if (hours.length === 0 || hours.every((h) => h.temperatureC.value === null))
    return noOutlook(requested, "no-series");

  if (hours.length < requested) {
    /*
     * COUNT WHAT CAME BACK, NOT WHAT WE DREW.
     *
     * This said "Only the next N hours were forecast." with N = the number of
     * columns, and it overstated twice over. It counted hours whose temperature
     * is null — columns that render an em dash, which is the opposite of being
     * forecast — and it called the hour in progress one of the "next" ones. Two
     * columns reading `Now —` and `10 PM −1°` were announced as two hours of
     * forecast when exactly one temperature had arrived. A sentence whose only
     * job is to declare a shortfall must not overstate the shortfall away.
     */
    const modelled = hours.filter((h) => h.temperatureC.value !== null).length;
    return {
      hours,
      requested,
      shortfall: "short-series",
      note:
        modelled === 1
          ? "Only one hour was forecast."
          : `Only ${modelled} hours were forecast.`,
    };
  }

  return { hours, requested };
}

/**
 * The elevation bands worth showing for a peak.
 *
 * Derived from the summit height rather than fixed, so a 1,500 m hill does not
 * get a "4,000 m" row it does not have.
 */
export function bandsFor(elevationM: number): { elevationM: number; label: string }[] {
  const steps: { elevationM: number; label: string }[] = [];
  const candidates = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000];
  for (const c of candidates) {
    if (c < elevationM - 300)
      steps.push({ elevationM: c, label: `${c.toLocaleString("en-GB")} m` });
  }
  steps.push({ elevationM: Math.round(elevationM), label: "Summit" });
  // Four rows is as much as reads well on a phone; keep the summit and the
  // three bands nearest it, which are the ones that describe the climb.
  return steps.slice(-4);
}

/**
 * Conditions for a peak. Never throws — a failure returns a fully-absent
 * result carrying the reason, because a weather panel that silently shows
 * nothing is indistinguishable from one showing calm weather.
 */
export async function getMountainConditions(args: {
  peakName: string;
  elevationM: number;
  lat: number;
  lon: number;
  /** Pro-only in the product; the caller decides whether to ask for bands. */
  includeBands?: boolean;
  /** Hours ahead to carry in `hourly`. Defaults to `HOURLY_OUTLOOK_HOURS`. */
  hourlyHours?: number;
  signal?: AbortSignal;
}): Promise<MountainConditions> {
  const {
    peakName,
    elevationM,
    lat,
    lon,
    includeBands = false,
    hourlyHours = HOURLY_OUTLOOK_HOURS,
    signal,
  } = args;

  /*
   * Offline there is no forecast to fetch, and a panel reading "the forecast
   * could not be loaded" on every screen for two hours is honest but dead. The
   * offline build says on every screen that its figures are invented, so it
   * shows an invented forecast rather than a permanent error — and it does it
   * without touching the network, which is the point.
   */
  if (OFFLINE) {
    return offlineConditions({
      peakName,
      elevationM,
      bands: bandsFor(elevationM),
      includeBands,
    });
  }

  const absent = (): CurrentConditions => ({
    temperatureC: { value: null, reason: "no-data" },
    feelsLikeC: { value: null, reason: "no-data" },
    windKph: { value: null, reason: "no-data" },
    windDirectionDeg: { value: null, reason: "no-data" },
    visibilityM: { value: null, reason: "no-data" },
    precipitationMm: { value: null, reason: "no-data" },
    freezingLevelM: { value: null, reason: "no-data" },
    weatherCode: { value: null, reason: "no-data" },
    isDay: null,
    observedAt: new Date().toISOString(),
  });

  try {
    const raw = await fetchForecast(lat, lon, elevationM, signal);

    const c = raw.current ?? {};
    const hourly = raw.hourly ?? {};

    // Index 0 is 00:00 TODAY, not now. Reading it gave the freezing level and
    // visibility from midnight and captioned them as current — and a freezing
    // level can move several hundred metres across a day, which is the
    // difference between snow and rain on the route. Find the hour nearest to
    // the current local time instead.
    const times = (hourly.time as string[] | undefined) ?? [];

    /**
     * The index of the hour that is CURRENT ON THE MOUNTAIN.
     *
     * `timezone=auto` makes Open-Meteo return naive local-to-the-peak stamps
     * ("2026-08-17T14:00") with no offset in the string. `new Date(t)` parses
     * those as the VIEWER's local time, so comparing against Date.now() picked
     * the row matching the reader's wall clock rather than the mountain's — for
     * a London reader looking at Everest that is nearly five hours out, and the
     * value is captioned "Modelled for the current hour". Parsing as UTC and
     * subtracting the response's own offset compares two real instants.
     */
    const offsetMs = (raw.utc_offset_seconds ?? 0) * 1000;

    /** The real instant an hourly stamp names, the mountain's offset removed. */
    const instantOf = (t: string): number => Date.parse(`${t}Z`) - offsetMs;

    /*
     * NEAREST, and never further than an hour away. −1 when the series does not
     * reach the present at all.
     *
     * Nearest is the right rule for a single instantaneous read: at 22:42 the
     * 23:00 model value describes the air outside better than the 22:00 one.
     * "Nearest" without a bound is a different thing entirely — on a series that
     * stops before now it returns whatever end of it happens to be closest, and
     * that is the clamp this file just deleted wearing another hat. Outside an
     * hour there is no current reading, so `atNow` returns nothing and the
     * screens draw their em dash.
     */
    const nowIdx = (() => {
      const now = Date.now();
      let best = -1;
      let bestGap = HOUR_MS;
      times.forEach((t, i) => {
        const gap = Math.abs(instantOf(t) - now);
        if (Number.isFinite(gap) && gap < bestGap) {
          bestGap = gap;
          best = i;
        }
      });
      return best;
    })();

    /*
     * THE HOUR IN PROGRESS — a FLOOR, and deliberately not `nowIdx`.
     *
     * The strip below runs forward from here and labels this column "Now", and
     * for that a nearest-hour index is wrong for twenty-nine minutes out of
     * every sixty: past the half hour it rounds FORWARD, so at 22:42 the column
     * headed "Now" carried the 23:00 forecast and the 22:00 row — the hour the
     * reader is actually standing in — never appeared at all. Someone counting
     * columns forward from "Now" was an hour out on every one of them.
     *
     * This is the hour whose stamp has passed and whose successor has not: the
     * hour containing this instant, not the stamp nearest to it.
     */
    const currentIdx = (() => {
      const now = Date.now();
      for (let i = 0; i < times.length; i++) {
        const inst = instantOf(times[i]);
        if (Number.isFinite(inst) && inst <= now && now - inst < HOUR_MS) return i;
      }
      return -1;
    })();

    /*
     * Where the strip begins when the series carries no hour containing now —
     * a response that starts later today, or one held past its own end. The
     * first hour still ahead is a real forecast and worth showing; what it is
     * not is "Now", and `currentIdx` being −1 is what stops it being labelled
     * that. −1 here too means there is nothing ahead to show.
     */
    const nextIdx = (() => {
      const now = Date.now();
      for (let i = 0; i < times.length; i++) {
        const inst = instantOf(times[i]);
        if (Number.isFinite(inst) && inst > now) return i;
      }
      return -1;
    })();

    const startIdx = currentIdx >= 0 ? currentIdx : nextIdx;

    /**
     * One reading from an hourly series at the current hour, or nothing.
     *
     * NO CLAMP. This used to end `series[Math.min(nowIdx, series.length - 1)]`,
     * which quietly substituted the LAST hour the series happened to carry when
     * that series was shorter than the others. Open-Meteo does not guarantee
     * every hourly variable runs the full week — visibility in particular can
     * come back for only part of it — and the clamp turned that into a lie with
     * a number in it: a response whose visibility ran out after the small hours
     * printed "130 m" on the objective card at seven in the evening, a
     * seventeen-hour-stale whiteout captioned as the visibility right now. The
     * same path feeds the freezing level on the conditions screen, where being
     * several hundred metres out is the difference between snow and rain.
     *
     * An index past the end of a series is an ABSENCE, not a neighbour. It
     * returns null, the reading is `{value: null}`, and the screen draws the
     * em dash it draws for everything nobody measured.
     */
    const atNow = <T>(key: string): T | null => {
      const series = hourly[key] as (T | null)[] | undefined;
      if (!series || nowIdx < 0 || nowIdx >= series.length) return null;
      return series[nowIdx] ?? null;
    };

    const current: CurrentConditions = {
      temperatureC: got(num(c.temperature_2m)),
      feelsLikeC: got(num(c.apparent_temperature)),
      windKph: got(num(c.wind_speed_10m)),
      windDirectionDeg: got(num(c.wind_direction_10m)),
      precipitationMm: got(num(c.precipitation)),
      visibilityM: got(num(atNow<number>("visibility"))),
      freezingLevelM: got(num(atNow<number>("freezing_level_height"))),
      weatherCode: got(num(c.weather_code)),
      isDay: flag(num(c.is_day)),
      observedAt: typeof c.time === "string" ? c.time : new Date().toISOString(),
    };

    /*
     * The strip of hours ahead. It takes TWO indices and they are not the same
     * number: where the window opens (the hour in progress, or the first hour
     * ahead if the series has none) and which column, if any, may call itself
     * "Now". Both inherit the timezone reasoning above rather than repeating it
     * — repeating it is how it would drift.
     */
    const outlook = buildOutlook(hourly, times, startIdx, currentIdx, hourlyHours);

    const d = raw.daily ?? {};
    const dates = (d.time as string[] | undefined) ?? [];
    const at = (key: string, i: number): number | null => {
      const series = d[key] as (number | null)[] | undefined;
      return series ? num(series[i]) : null;
    };
    const str = (key: string, i: number): string | undefined => {
      const series = d[key] as string[] | undefined;
      return series?.[i];
    };

    const daily: DayForecast[] = dates.map((date, i) => ({
      date,
      maxC: got(at("temperature_2m_max", i)),
      minC: got(at("temperature_2m_min", i)),
      windMaxKph: got(at("wind_speed_10m_max", i)),
      precipitationMm: got(at("precipitation_sum", i)),
      snowfallCm: got(at("snowfall_sum", i)),
      sunrise: str("sunrise", i),
      sunset: str("sunset", i),
    }));

    let bands: ElevationBand[] = [];
    if (includeBands) {
      const wanted = bandsFor(elevationM);
      const results = await Promise.all(
        wanted.map(async (b) => {
          // The summit row is already in hand; don't pay for it twice.
          if (Math.abs(b.elevationM - Math.round(elevationM)) < 1) {
            return {
              elevationM: b.elevationM,
              label: b.label,
              temperatureC: current.temperatureC,
              windKph: current.windKph,
            };
          }
          try {
            const r = await fetchForecast(lat, lon, b.elevationM, signal, true);
            const rc = r.current ?? {};
            return {
              elevationM: b.elevationM,
              label: b.label,
              temperatureC: got(num(rc.temperature_2m)),
              windKph: got(num(rc.wind_speed_10m)),
            };
          } catch {
            return {
              elevationM: b.elevationM,
              label: b.label,
              temperatureC: { value: null, reason: "no-data" as const },
              windKph: { value: null, reason: "no-data" as const },
            };
          }
        }),
      );
      bands = results;
    }

    return { peakName, elevationM, current, hourly: outlook, daily, bands };
  } catch (err) {
    return {
      peakName,
      elevationM,
      current: absent(),
      hourly: noOutlook(hourlyHours, "request-failed"),
      daily: [],
      bands: [],
      error: err instanceof Error ? err.message : "Forecast unavailable",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Window assessment                                                          */
/* -------------------------------------------------------------------------- */

export type WindowRating = "favourable" | "mixed" | "poor" | "unknown";

export interface RatedDay {
  date: string;
  rating: WindowRating;
  /** The reasons behind the rating, so it is never a colour with no argument. */
  notes: string[];
  forecast: DayForecast;
}

/**
 * Rates a day against thresholds that matter on a mountain rather than in a
 * city — wind first, then new snow, then precipitation, then cold.
 *
 * The vocabulary is deliberate: "favourable" and "poor" describe the weather.
 * They are NOT "go" and "no-go". Nothing in this module recommends climbing or
 * not climbing, and no caller should render these as permission.
 */
export function rateDay(day: DayForecast): RatedDay {
  const notes: string[] = [];
  let severity = 0;

  const wind = day.windMaxKph.value;
  const snow = day.snowfallCm.value;
  const rain = day.precipitationMm.value;
  const min = day.minC.value;

  if (wind === null && snow === null && rain === null) {
    return {
      date: day.date,
      rating: "unknown",
      notes: ["No forecast for this day."],
      forecast: day,
    };
  }

  if (wind !== null) {
    if (wind >= 60) {
      severity = Math.max(severity, 2);
      notes.push(`Wind to ${Math.round(wind)} km/h.`);
    } else if (wind >= 35) {
      severity = Math.max(severity, 1);
      notes.push(`Wind to ${Math.round(wind)} km/h.`);
    }
  }

  if (snow !== null && snow > 0) {
    if (snow >= 15) {
      severity = Math.max(severity, 2);
      notes.push(`${snow.toFixed(0)} cm of new snow — consider the avalanche bulletin.`);
    } else if (snow >= 3) {
      severity = Math.max(severity, 1);
      notes.push(`${snow.toFixed(0)} cm of new snow.`);
    }
  }

  if (rain !== null && rain >= 10) {
    severity = Math.max(severity, 1);
    notes.push(`${rain.toFixed(0)} mm of precipitation.`);
  }

  if (min !== null && min <= -25) {
    severity = Math.max(severity, 2);
    notes.push(`Overnight low near ${Math.round(min)}°C.`);
  }

  if (notes.length === 0) notes.push("Nothing notable in the modelled figures.");

  return {
    date: day.date,
    rating: severity >= 2 ? "poor" : severity === 1 ? "mixed" : "favourable",
    notes,
    forecast: day,
  };
}

/** The days inside an expedition window, rated. Local dates throughout. */
export function rateWindow(daily: DayForecast[], fromIso: string, toIso: string): RatedDay[] {
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const from = key(new Date(fromIso));
  const to = key(new Date(toIso));
  return daily.filter((d) => d.date >= from && d.date <= to).map(rateDay);
}
