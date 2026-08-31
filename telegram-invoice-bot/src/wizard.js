// Shared input parsing for the /add and /edit flows, so both collect and
// validate frequency the same way.

import { DateTime } from 'luxon';
import { WEEKDAYS } from './schedule.js';

export const VALID_TYPES = [
  'weekly',
  'biweekly',
  'monthly',
  'per_withdrawal',
  'manual_review',
  'salary',
];

export const VALID_STATUSES = ['active', 'manual_review', 'paused', 'salary'];

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// weekly/biweekly/monthly need a follow-up date question; the others don't.
export function needsDate(type) {
  return type === 'weekly' || type === 'biweekly' || type === 'monthly';
}

export function datePrompt(type) {
  switch (type) {
    case 'weekly':
      return 'Which day of the week? (e.g. Monday)';
    case 'biweekly':
      return 'Two days of the month like  1,16  — or an anchor date  YYYY-MM-DD  (fires every 14 days from it).';
    case 'monthly':
      return 'Which day of the month? A number 1–31, or  last  for end of month.';
    default:
      return null;
  }
}

// Parse the date answer for a given type. Returns { frequency } or { error }.
export function parseDateInput(type, text) {
  const t = String(text).trim();

  if (type === 'weekly') {
    const day = t.toLowerCase();
    if (!WEEKDAYS.includes(day)) return { error: 'Enter a weekday name, e.g. Monday.' };
    return { frequency: { type, day_of_week: capitalize(day) } };
  }

  if (type === 'biweekly') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      if (!DateTime.fromISO(t).isValid) return { error: 'Invalid date. Use YYYY-MM-DD.' };
      return { frequency: { type, anchor_date: t } };
    }
    const parts = t
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 31);
    if (!parts.length) return { error: 'Enter days like  1,16  — or a date  YYYY-MM-DD.' };
    return { frequency: { type, days_of_month: parts } };
  }

  if (type === 'monthly') {
    const v = t.toLowerCase();
    if (['last', 'end', 'eom'].includes(v)) return { frequency: { type, day_of_month: 'last' } };
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 1 || n > 31) return { error: 'Enter a number 1–31, or  last.' };
    return { frequency: { type, day_of_month: n } };
  }

  return { error: 'No date needed for this type.' };
}

// manual_review / salary imply a matching status so the creator behaves right
// without a second step. per_withdrawal and dated types stay 'active'.
export function statusForType(type) {
  if (type === 'manual_review') return 'manual_review';
  if (type === 'salary') return 'salary';
  return 'active';
}
