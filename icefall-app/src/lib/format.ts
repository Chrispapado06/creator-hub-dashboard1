/** Presentation helpers. Every metric in ICEFALL is formatted here. */

export const fmtDistance = (km: number, digits = 1) =>
  km >= 100 ? Math.round(km).toLocaleString("en-GB") : km.toFixed(digits);

export const fmtElevation = (m: number) => Math.round(m).toLocaleString("en-GB");

/** 8_100 → "2:15:00"; 2_745 → "45:45" */
export function fmtDuration(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Compact form for dashboards: 8h 45m */
export function fmtDurationCompact(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fmtHours(hours: number) {
  /* Round ONCE, in minutes, then split. Flooring the hours first and rounding
     the remainder separately lets the remainder reach 60: 188.995 h rendered as
     "188h 60m" on the profile. Rounding the total first cannot produce a
     minute field of 60. */
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Seconds per km → "5:12 /km" */
export function fmtPace(secPerKm: number) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const fmtPrice = (eur: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(eur);

/**
 * A calendar day (`2027-05-01`) as a LOCAL date; anything else unchanged.
 *
 * THE BUG THIS FIXES, WHICH WAS EVERYWHERE.
 *
 * `new Date("2027-05-01")` is parsed as UTC midnight by specification. West of
 * Greenwich that instant is still 30 April, so every bare calendar date in this
 * app — objective target dates, summit dates, event dates, trial end dates —
 * rendered as THE DAY BEFORE for a user in the Americas. Their summit date, the
 * date their trial ends, the day they topped out: all off by one, silently, and
 * only for some of the world.
 *
 * A full instant (`2026-08-30T04:05:00.000Z`) carries its own offset and is
 * already correct, so it is passed through untouched — the two must not be
 * treated alike, which is exactly why this is a parse and not a blanket change.
 *
 * The project has fixed this same class of bug several times at individual call
 * sites (`guides/dates.ts`, `network/groups.ts`, `DateField`). It lived on here
 * because this helper is where 70 call sites reach for a date, and none of them
 * could see which kind of string they were passing.
 */
function asLocalDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return new Date(iso);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // Rejects 2027-02-31, which the constructor would roll silently into March.
  // An unparseable date falls back to the original behaviour rather than
  // inventing a day — an Invalid Date renders as "Invalid Date", which is at
  // least visibly wrong instead of quietly wrong.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return new Date(iso);
  }
  return date;
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return asLocalDate(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  });
}

export function fmtDateShort(iso: string) {
  return asLocalDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "2h ago" / "3d ago" — community feed timestamps. */
export function fmtRelative(iso: string, now = new Date()) {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDateShort(iso);
}

/** "8 months to go" / "Passed" — goal countdowns. */
export function fmtCountdown(targetIso: string, now = new Date()) {
  const target = new Date(targetIso);
  const days = Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "Date passed";
  if (days === 0) return "Today";
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"} to go`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} ${months === 1 ? "month" : "months"} to go`;
  return `${Math.round(months / 12)} years to go`;
}

/* -------------------------------------------------------------------------- */
/* Weather                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A true minus sign (U+2212) rather than a hyphen.
 *
 * Not typographic vanity. A hyphen is short, sits high, and is genuinely easy
 * to miss on a phone in daylight — and "3.9" read for "−3.9" is a 7 °C error
 * about whether the ground is frozen. The minus sign is the width of the digits
 * beside it and cannot be mistaken for nothing.
 *
 * ⚠️ THIS LIVES HERE BECAUSE TWO SCREENS DRIFTED APART ON IT. The rule was
 * written and enforced on the full-forecast screen while the Home card — the
 * larger, more glanceable surface, seven numbers to a card, 40px on the
 * headline — rendered plain hyphens one tap away. Same peak, same minute,
 * "−2.9°C" on one screen and "-3°" on the other. Anything in ICEFALL that
 * prints a temperature imports it from here.
 */
export const minus = (s: string) => s.replace(/^-/, "−");

/** The number alone, one decimal, for tiles carrying "°C" as a separate unit. */
export const fmtTempValue = (v: number) => minus(v.toFixed(1));

/**
 * A whole-degree temperature with its sign: "−3°", "0°".
 *
 * `Math.round(-0.3)` is negative zero and `String(-0)` is "0", so a fraction of
 * a degree below freezing prints as "0°" and never as "-0°". A measured zero is
 * a zero; only an absent reading is an em dash, and that decision belongs to
 * the caller holding the `Reading`.
 */
export const fmtTempCoarse = (v: number) => minus(`${Math.round(v)}°`);

/** A whole-degree temperature for running prose — no degree sign. */
export const fmtTempInProse = (v: number) => minus(`${Math.round(v)}`);

/**
 * Visibility, in the unit a climber reads it in.
 *
 * Metres below a kilometre, because that is the band where the number decides
 * something. ONE DECIMAL up to 10 km: rounding to whole kilometres turned 1,500 m
 * into "2 km" on the Home card while the forecast screen said "1.5 km", and it
 * rounded UP, in exactly the band where being generous is the wrong error.
 */
export const fmtVisibility = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;

export const DIFFICULTY_LABELS = ["", "Accessible", "Moderate", "Demanding", "Serious", "Extreme"];

export const fmtDifficulty = (d: number) => `${d} / 5 · ${DIFFICULTY_LABELS[d] ?? ""}`;

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export const MODE_LABELS: Record<string, string> = {
  hiking: "Hiking",
  // The coarse family label. Trail running is one kind of running, not the
  // only kind — a treadmill session was being captioned "Trail Running".
  running: "Running",
  climbing: "Climbing",
  mountaineering: "Mountaineering",
  cycling: "Cycling",
  "ski-touring": "Ski Touring",
};

export const FOCUS_LABELS: Record<string, string> = {
  recovery: "Recovery",
  endurance: "Endurance",
  strength: "Strength",
  intervals: "Intervals",
  "long-mountain": "Long Mountain Session",
  rest: "Rest",
  technical: "Technical",
};
