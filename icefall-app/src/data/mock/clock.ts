/**
 * All fixtures are dated relative to "now" so the app never looks stale.
 * Screens read ISO strings; only this module knows about offsets.
 */

const DAY = 86_400_000;

export const now = () => new Date();

export const daysAgo = (n: number, hour = 8, minute = 12) => {
  const d = new Date(Date.now() - n * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export const daysAhead = (n: number, hour = 6, minute = 0) => {
  const d = new Date(Date.now() + n * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export const monthsAhead = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  d.setHours(6, 0, 0, 0);
  return d.toISOString();
};

export const yearsAgo = (n: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString();
};

/** Monday of the current week, used to anchor the training plan. */
export function startOfWeek(ref = new Date()) {
  const d = new Date(ref);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Local-calendar YYYY-MM-DD.
 *
 * Must not go through `toISOString()`: the plan anchors weeks at local
 * midnight, and in any positive UTC offset that serialises back to the
 * previous day — which shifted every training day by one and lit the wrong
 * cell in the week strip.
 */
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
