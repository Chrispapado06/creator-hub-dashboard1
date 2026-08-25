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
  daily: DayForecast[];
  bands: ElevationBand[];
  /** Set when the whole request failed; every reading will be absent. */
  error?: string;
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

async function fetchForecast(
  lat: number,
  lon: number,
  elevationM: number,
  signal?: AbortSignal,
): Promise<RawForecast> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    elevation: String(Math.round(elevationM)),
    current: "temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,precipitation",
    hourly: "freezing_level_height,visibility", // `time` is returned alongside automatically
    daily:
      "temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum,snowfall_sum,sunrise,sunset",
    forecast_days: "7",
    timezone: "auto",
  });

  const res = await fetch(`${ENDPOINT}?${params}`, {
    signal: withTimeout(CONDITIONS_TIMEOUT_MS, signal),
  });
  if (!res.ok) throw new Error(`forecast ${res.status}`);
  return (await res.json()) as RawForecast;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

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
  signal?: AbortSignal;
}): Promise<MountainConditions> {
  const { peakName, elevationM, lat, lon, includeBands = false, signal } = args;

  const absent = (): CurrentConditions => ({
    temperatureC: { value: null, reason: "no-data" },
    feelsLikeC: { value: null, reason: "no-data" },
    windKph: { value: null, reason: "no-data" },
    windDirectionDeg: { value: null, reason: "no-data" },
    visibilityM: { value: null, reason: "no-data" },
    precipitationMm: { value: null, reason: "no-data" },
    freezingLevelM: { value: null, reason: "no-data" },
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
    const nowIdx = (() => {
      if (times.length === 0) return 0;
      const now = Date.now();
      let best = 0;
      let bestGap = Infinity;
      times.forEach((t, i) => {
        const instant = Date.parse(`${t}Z`) - offsetMs;
        if (!Number.isFinite(instant)) return;
        const gap = Math.abs(instant - now);
        if (gap < bestGap) {
          bestGap = gap;
          best = i;
        }
      });
      return best;
    })();

    const atNow = <T>(key: string): T | null => {
      const series = hourly[key] as (T | null)[] | undefined;
      if (!series || series.length === 0) return null;
      return series[Math.min(nowIdx, series.length - 1)] ?? null;
    };

    const current: CurrentConditions = {
      temperatureC: got(num(c.temperature_2m)),
      feelsLikeC: got(num(c.apparent_temperature)),
      windKph: got(num(c.wind_speed_10m)),
      windDirectionDeg: got(num(c.wind_direction_10m)),
      precipitationMm: got(num(c.precipitation)),
      visibilityM: got(num(atNow<number>("visibility"))),
      freezingLevelM: got(num(atNow<number>("freezing_level_height"))),
      observedAt: typeof c.time === "string" ? c.time : new Date().toISOString(),
    };

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
            const r = await fetchForecast(lat, lon, b.elevationM, signal);
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

    return { peakName, elevationM, current, daily, bands };
  } catch (err) {
    return {
      peakName,
      elevationM,
      current: absent(),
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
