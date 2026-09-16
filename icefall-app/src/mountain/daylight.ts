/**
 * DAYLIGHT, WORKED OUT ON THE PHONE (plan §1.3, §3.2).
 *
 * Sunrise, sunset and the end of civil twilight from a position, a date and
 * nothing else. The equations are the US National Oceanic and Atmospheric
 * Administration's published solar calculator (public domain), themselves
 * after Meeus, "Astronomical Algorithms". `now.test.ts` checks it against
 * published times on five of the curated mountains and inside the Arctic.
 *
 * Pure arithmetic: no imports, no clock read, no network. It works in
 * aeroplane mode because there is nothing here that could fail to.
 *
 * WHAT IT DOES NOT KNOW, and the screen must say: this is the sun crossing a
 * flat horizon. A ridge to the west takes the light sooner, and ICEFALL does
 * not know the skyline.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

/** Standard sunrise/sunset zenith: 90° plus refraction (34′) and the sun's radius (16′). */
const ZENITH_SUN = 90.833;
/** Civil twilight ends when the sun's centre is 6° below the horizon. */
const ZENITH_CIVIL = 96;

/**
 * How far below the astronomical horizon an observer at `altitudeM` can see,
 * in degrees. From height the sea-level horizon drops away, so the sun sets
 * later: about ten minutes at 4,000 m in the Alps.
 */
export function horizonDipDeg(altitudeM: number | null | undefined): number {
  if (altitudeM == null || !Number.isFinite(altitudeM) || altitudeM <= 0) return 0;
  return (2.076 * Math.sqrt(altitudeM)) / 60;
}

interface SolarTerms {
  /** Declination, degrees. */
  decl: number;
  /** Equation of time, minutes. */
  eqTime: number;
}

/** NOAA's solar terms at an instant, given as ms since the epoch. */
function solarTerms(ms: number): SolarTerms {
  const jd = ms / DAY_MS + 2440587.5;
  const t = (jd - 2451545) / 36525;

  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * RAD) * 0.000289;

  const omega = 125.04 - 1934.136 * t;
  const appLong = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);

  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);

  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD)) * DEG;

  const y = Math.tan((obliq / 2) * RAD) ** 2;
  const l0r = l0 * RAD;
  const mr = m * RAD;
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * l0r) -
      2 * e * Math.sin(mr) +
      4 * e * y * Math.sin(mr) * Math.cos(2 * l0r) -
      0.5 * y * y * Math.sin(4 * l0r) -
      1.25 * e * e * Math.sin(2 * mr));

  return { decl, eqTime };
}

type Crossing =
  | { kind: "time"; ms: number }
  /** The sun stays above this zenith all day. */
  | { kind: "always-above" }
  /** The sun never climbs above this zenith. */
  | { kind: "always-below" };

/** Midnight UTC of a YYYY-MM-DD date, or NaN. */
function utcMidnight(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * The moment the sun's centre crosses `zenith` on `date`, rising or setting.
 * Two passes: the first estimates the time, the second recomputes the sun's
 * position at that time, which is what brings it inside a minute.
 */
function crossing(
  date: string,
  lat: number,
  lon: number,
  zenith: number,
  rising: boolean,
): Crossing {
  const day = utcMidnight(date);
  // First guess: local solar noon on that date.
  let ms = day + (720 - 4 * lon) * MIN_MS;
  let result: Crossing = { kind: "always-below" };
  for (let pass = 0; pass < 2; pass++) {
    const { decl, eqTime } = solarTerms(ms);
    const cosHa =
      Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(decl * RAD)) -
      Math.tan(lat * RAD) * Math.tan(decl * RAD);
    if (cosHa > 1) return { kind: "always-below" };
    if (cosHa < -1) return { kind: "always-above" };
    const haMin = 4 * Math.acos(cosHa) * DEG;
    const noonMin = 720 - 4 * lon - eqTime;
    ms = day + (noonMin + (rising ? -haMin : haMin)) * MIN_MS;
    result = { kind: "time", ms };
  }
  return result;
}

export interface SunDay {
  /** The local calendar date asked about, YYYY-MM-DD. */
  date: string;
  /** Epoch ms, or null when the sun does not rise or set that day. */
  sunrise: number | null;
  sunset: number | null;
  /** When civil twilight ends — the last usable light. Null when it does not end. */
  civilDusk: number | null;
  civilDawn: number | null;
  /** Set when there is no ordinary sunrise and sunset. */
  polar: "midnight-sun" | "polar-night" | null;
  /** The horizon dip applied for altitude, degrees. */
  dipDeg: number;
}

/**
 * Sunrise, sunset and civil twilight for the local date `date` at a position.
 * `date` should be the calendar date where the athlete is standing.
 */
export function sunDay(
  date: string,
  lat: number,
  lon: number,
  altitudeM: number | null = null,
): SunDay {
  const dipDeg = horizonDipDeg(altitudeM);
  const rise = crossing(date, lat, lon, ZENITH_SUN + dipDeg, true);
  const set = crossing(date, lat, lon, ZENITH_SUN + dipDeg, false);
  const dawn = crossing(date, lat, lon, ZENITH_CIVIL, true);
  const dusk = crossing(date, lat, lon, ZENITH_CIVIL, false);

  const polar =
    set.kind === "always-above"
      ? "midnight-sun"
      : set.kind === "always-below"
        ? "polar-night"
        : null;

  return {
    date,
    sunrise: rise.kind === "time" ? rise.ms : null,
    sunset: set.kind === "time" ? set.ms : null,
    civilDawn: dawn.kind === "time" ? dawn.ms : null,
    // Civil twilight never ends while the sun itself never sets.
    civilDusk: dusk.kind === "time" ? dusk.ms : null,
    polar,
    dipDeg,
  };
}

/**
 * The calendar date at a longitude by the sun (4 minutes per degree), not by the
 * phone's time zone: a phone still on home time must still get this place's day.
 */
export function solarDateISO(now: number, lon: number): string {
  return new Date(now + lon * 4 * MIN_MS).toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* What the Now screen says                                                    */
/* -------------------------------------------------------------------------- */

export type DaylightNow =
  /** Before sunrise today. */
  | { kind: "before-sunrise"; sunrise: number; msToSunrise: number; today: SunDay }
  /** The sun is up. `msToSunset` is the headline; the twilight after it is the second figure. */
  | {
      kind: "day";
      sunset: number;
      msToSunset: number;
      civilDusk: number | null;
      msTwilight: number | null;
      today: SunDay;
    }
  /** Sun down, still civil twilight. */
  | { kind: "twilight"; civilDusk: number; msToDark: number; today: SunDay }
  /** Dark. Tomorrow's sunrise, when there is one. */
  | { kind: "dark"; nextSunrise: number | null; tomorrow: SunDay }
  | { kind: "midnight-sun"; today: SunDay }
  | { kind: "polar-night"; today: SunDay };

/** Where `now` sits in the day. `today` and `tomorrow` are local dates at the position. */
export function daylightAt(
  now: number,
  today: string,
  tomorrow: string,
  lat: number,
  lon: number,
  altitudeM: number | null = null,
): DaylightNow {
  const d = sunDay(today, lat, lon, altitudeM);
  if (d.polar === "midnight-sun") return { kind: "midnight-sun", today: d };
  if (d.polar === "polar-night") return { kind: "polar-night", today: d };
  const { sunrise, sunset, civilDusk } = d;
  if (sunrise === null || sunset === null) return { kind: "polar-night", today: d };

  if (now < sunrise)
    return { kind: "before-sunrise", sunrise, msToSunrise: sunrise - now, today: d };
  if (now < sunset) {
    return {
      kind: "day",
      sunset,
      msToSunset: sunset - now,
      civilDusk,
      msTwilight: civilDusk !== null ? civilDusk - sunset : null,
      today: d,
    };
  }
  if (civilDusk !== null && now < civilDusk) {
    return { kind: "twilight", civilDusk, msToDark: civilDusk - now, today: d };
  }
  const t = sunDay(tomorrow, lat, lon, altitudeM);
  return { kind: "dark", nextSunrise: t.sunrise, tomorrow: t };
}

/**
 * THE PHONE'S CLOCK MAY BE IN ANOTHER COUNTRY (plan §9.1 point 11).
 *
 * Daylight, the turnaround and the trip day all trust the phone's clock. A
 * phone that flew to Kathmandu and never saw a network may still be on
 * European time, and every figure is then wrong by hours, consistently.
 *
 * Compares the phone's UTC offset with the offset the sun implies at the
 * longitude (4 minutes per degree). The plan suggests about 90 minutes; that
 * fires wrongly on Mont Blanc every summer (Paris summer time is 93 minutes
 * ahead of the sun there), and western China and Alaska sit 2 hours off the
 * sun by law. So the threshold is 3 hours: it still catches a European phone
 * in Nepal (about 3 h 48 min out) or an American phone in the Alps.
 */
export const CLOCK_MISMATCH_MIN = 180;

export function clockLooksWrong(phoneUtcOffsetMin: number, lon: number): boolean {
  const solarOffsetMin = lon * 4;
  let diff = Math.abs(phoneUtcOffsetMin - solarOffsetMin);
  // Across the date line the two can be a day apart and still agree.
  if (diff > 720) diff = 1440 - diff;
  return diff > CLOCK_MISMATCH_MIN;
}

export const FLAT_HORIZON_NOTE =
  "This is the sun below a flat horizon. A ridge to your west takes the light sooner — sometimes an hour sooner. ICEFALL does not know your skyline.";

export const CLOCK_CHECK = "Your phone's clock may be set to another country. Check it.";
