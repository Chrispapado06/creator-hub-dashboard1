// Frequency-matching logic: given a list of creators and "now" (a luxon
// DateTime already set to the configured timezone), decide who is due.

import { DateTime } from 'luxon';

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export { WEEKDAYS };

// ISO weekday numbers (Monday = 1 … Sunday = 7), compared against luxon's
// numeric `now.weekday`. This is locale-independent, unlike `weekdayLong`
// (which returns "lundi"/"Montag" on a non-English host and would silently
// stop every weekly reminder from ever matching).
const WEEKDAY_ISO = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

// Creators that should never appear in any reminder.
export function isExcluded(creator) {
  const type = creator?.frequency?.type;
  return type === 'salary' || creator?.status === 'salary' || creator?.status === 'paused';
}

// Creators that appear in every daily message until their status is flipped.
export function isManualReview(creator) {
  return creator?.status === 'manual_review';
}

// Does this creator's fixed schedule land on `now`'s date?
export function isDueOn(creator, now) {
  if (isExcluded(creator)) return false;
  if (isManualReview(creator)) return false; // surfaced separately, not date-driven

  const f = creator.frequency || {};
  switch (f.type) {
    case 'weekly': {
      const target = String(f.day_of_week || 'Monday').toLowerCase();
      return now.weekday === WEEKDAY_ISO[target];
    }
    case 'biweekly': {
      if (Array.isArray(f.days_of_month) && f.days_of_month.length) {
        return f.days_of_month.some((d) => dayMatches(d, now));
      }
      if (f.anchor_date) {
        const anchor = DateTime.fromISO(f.anchor_date, { zone: now.zoneName }).startOf('day');
        if (!anchor.isValid) return false;
        const diff = Math.round(now.startOf('day').diff(anchor, 'days').days);
        return diff >= 0 && diff % 14 === 0;
      }
      return false;
    }
    case 'monthly': {
      if (f.day_of_month === undefined || f.day_of_month === null) {
        return now.day === now.daysInMonth; // default: end of month
      }
      return dayMatches(f.day_of_month, now);
    }
    case 'per_withdrawal':
    case 'manual_review':
    case 'salary':
    default:
      return false;
  }
}

// Match a single day-of-month spec (a number, or the string "last") against
// today, handling months shorter than the target so an invoice isn't skipped.
function dayMatches(target, now) {
  const daysInMonth = now.daysInMonth;
  if (typeof target === 'string' && target.toLowerCase() === 'last') {
    return now.day === daysInMonth;
  }
  const n = Number(target);
  if (!Number.isFinite(n)) return false;
  if (now.day === n) return true;
  // e.g. a "31st" invoice in a 30-day month fires on the last day instead.
  if (n > daysInMonth && now.day === daysInMonth) return true;
  return false;
}

export function isWeeklyDigestDay(now, digestDay = 'Monday') {
  return now.weekday === WEEKDAY_ISO[String(digestDay).toLowerCase()];
}

// Build the sections for one daily run.
export function buildDailyReport(creators, now, { digestDay = 'Monday' } = {}) {
  const due = [];
  const needsSorting = [];
  const digest = [];
  const includeDigest = isWeeklyDigestDay(now, digestDay);

  for (const c of creators) {
    if (isExcluded(c)) continue;
    if (isManualReview(c)) {
      needsSorting.push(c);
      continue;
    }
    if (isDueOn(c, now)) due.push(c);
    if (includeDigest && c.frequency?.type === 'per_withdrawal') digest.push(c);
  }

  const byName = (a, b) => a.name.localeCompare(b.name);
  due.sort(byName);
  needsSorting.sort(byName);
  digest.sort(byName);

  return { due, needsSorting, digest, includeDigest };
}
