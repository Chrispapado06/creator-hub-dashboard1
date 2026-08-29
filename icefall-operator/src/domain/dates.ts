/**
 * Local-day handling.
 *
 * `new Date("2026-09-01")` parses as UTC MIDNIGHT, so anywhere west of
 * Greenwich it renders as 31 August. This bug has been fixed several times in
 * the ICEFALL family already; these helpers exist so it cannot come back through
 * this app. A placement that expires on the 30th must not read as the 29th to
 * the operator whose commercial relationship it is.
 *
 * A calendar day here is the string `YYYY-MM-DD` and is never converted to a
 * `Date` for display — only parsed into its three integer parts.
 */

export interface Day {
  year: number;
  month: number;
  day: number;
}

/** Splits `YYYY-MM-DD` without going near a timezone. */
export function parseDay(iso: string): Day | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2026-09-30" → "30 Sep 2026". */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDay(iso);
  if (!d) return "—";
  return `${d.day} ${MONTHS[d.month - 1]} ${d.year}`;
}

/** "2026-09-30" → "30 Sep". For ranges where the year is stated once. */
export function formatDayShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDay(iso);
  if (!d) return "—";
  return `${d.day} ${MONTHS[d.month - 1]}`;
}

export function formatRange(from: string | null, to: string | null): string {
  if (!from && !to) return "—";
  if (from && to) {
    const a = parseDay(from);
    const b = parseDay(to);
    if (a && b && a.year === b.year) return `${formatDayShort(from)} – ${formatDay(to)}`;
    return `${formatDay(from)} – ${formatDay(to)}`;
  }
  return formatDay(from ?? to);
}

/** Days from `today` to `iso`. Negative once it is in the past. */
export function daysUntil(iso: string, today: string): number | null {
  const a = parseDay(today);
  const b = parseDay(iso);
  if (!a || !b) return null;
  const toUtc = (d: Day) => Date.UTC(d.year, d.month - 1, d.day);
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Relative wording for a timestamp, against a fixed "now" so it is testable. */
export function timeAgo(isoTimestamp: string, nowIso: string): string {
  const then = Date.parse(isoTimestamp);
  const now = Date.parse(nowIso);
  if (Number.isNaN(then) || Number.isNaN(now)) return "—";
  const mins = Math.max(0, Math.round((now - then) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDay(isoTimestamp.slice(0, 10));
}

/**
 * The clock, in one place.
 *
 * Seeded data is fixed so every screen is deterministic and a screenshot taken
 * today matches one taken next week. When this app is wired to Supabase, this
 * becomes `new Date().toISOString()` and nothing else changes.
 */
export const NOW = "2026-08-28T09:20:00.000Z";
export const TODAY = NOW.slice(0, 10);
