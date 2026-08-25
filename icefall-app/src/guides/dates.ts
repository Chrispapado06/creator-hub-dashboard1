/**
 * Calendar keys for the marketplace.
 *
 * NEVER `toISOString()`. A UTC date string shifts the day for anyone west of
 * Greenwich after mid-afternoon, which has already caused a real bug in this
 * app's training week strip. A guide marking Thursday unavailable and ICEFALL
 * storing Wednesday is the same bug with a party on the glacier.
 */

/** `YYYY-MM-DD` from LOCAL date components. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parses a `YYYY-MM-DD` key back to LOCAL midnight, not UTC midnight. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export const todayKey = (): string => dateKey(new Date());

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/** Whole days between two keys. Negative when `to` is before `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromDateKey(to).getTime() - fromDateKey(from).getTime()) / 86_400_000);
}

/** Inclusive of both ends: a single-day engagement is one day, not zero. */
export const nightsToDays = (from: string, to: string): number =>
  Math.max(1, daysBetween(from, to) + 1);

/** "12–15 Jun 2027", or a single date when the trip is one day. */
export function formatDateRange(from: string, to: string): string {
  const a = fromDateKey(from);
  const b = fromDateKey(to);
  const long: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (from === to) return a.toLocaleDateString("en-GB", long);
  const sameYear = a.getFullYear() === b.getFullYear();
  const sameMonth = sameYear && a.getMonth() === b.getMonth();
  const start = a.toLocaleDateString("en-GB", {
    day: "numeric",
    ...(sameMonth ? {} : { month: "short" }),
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${start} – ${b.toLocaleDateString("en-GB", long)}`;
}

/** Every `YYYY-MM-DD` in the month containing `key`, in order. */
export function monthDays(key: string): string[] {
  const d = fromDateKey(key);
  const year = d.getFullYear();
  const month = d.getMonth();
  const last = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => dateKey(new Date(year, month, i + 1)));
}

/** Monday-first weekday index (0 = Monday) — the calendar grid's offset. */
export function mondayFirstIndex(key: string): number {
  return (fromDateKey(key).getDay() + 6) % 7;
}

export function monthLabel(key: string): string {
  return fromDateKey(key).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function shiftMonth(key: string, months: number): string {
  const d = fromDateKey(key);
  // Clamp to the 1st before shifting: 31 March + 1 month would otherwise land
  // on 1 May and skip April entirely in the month stepper.
  return dateKey(new Date(d.getFullYear(), d.getMonth() + months, 1));
}
