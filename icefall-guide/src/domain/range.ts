/**
 * THE REPORTING WINDOW — what "this season" actually means, and what it is
 * being compared against.
 *
 * The mockup's "This season" chip was decorative. Making it real forces a
 * question the static version let us dodge: **when a guide changes the window,
 * what is the "+18% vs last season" comparing to?**
 *
 * THE ANSWER IS THE PRECEDING WINDOW OF EQUAL LENGTH, computed from the same
 * rows. Not a seeded "last season" figure — this app carried one until
 * 2026-08-30, and it was a number with nothing behind it that happened to sit
 * next to real ones. A comparison the guide can change has to be derived, or the
 * first thing they do with the new control is discover the delta never moves.
 *
 * AND WHERE THE PRECEDING WINDOW HAS NOTHING IN IT, THERE IS NO DELTA — not 0%,
 * which would claim the guide had stood still. A guide in their first season has
 * not declined by 100%.
 */

import { startOfDay } from "@/lib/day";

/**
 * HOW A WINDOW WANTS TO BE COMPARED, carried on the window itself.
 *
 * "The preceding window of equal length" is right for a rolling 30 days and
 * WRONG for a season. The six months before May–October are November–April,
 * which in the Alps is winter — comparing a guide's summer against the winter
 * before it is arithmetically fine and commercially meaningless, and it is not
 * what anybody means by "vs last season".
 *
 * So the preset says which comparison it wants rather than a heuristic guessing
 * from the window's length. A season and a year compare against the same dates
 * one year earlier; everything else compares against the window immediately
 * before it.
 */
export type Comparison = "previous-period" | "previous-year";

export interface DateRange {
  /** Inclusive local day. */
  from: Date;
  /** Inclusive local day. */
  to: Date;
  label: string;
  comparison: Comparison;
}

export type PresetId = "season" | "d30" | "m3" | "year" | "custom";

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: "season", label: "This season" },
  { id: "d30", label: "30 days" },
  { id: "m3", label: "3 months" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];

/** May to October — the alpine season this app's overview describes. */
export const SEASON_START_MONTH = 4;
export const SEASON_END_MONTH = 9;

const fmt = (d: Date, withYear = true) =>
  d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });

export function rangeLabel(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  return `${fmt(from, !sameYear)} – ${fmt(to)}`;
}

export function presetRange(id: Exclude<PresetId, "custom">, now = new Date()): DateRange {
  const today = startOfDay(now);
  switch (id) {
    case "season": {
      const from = new Date(now.getFullYear(), SEASON_START_MONTH, 1);
      const to = new Date(now.getFullYear(), SEASON_END_MONTH + 1, 0);
      return { from, to, label: "This season", comparison: "previous-year" };
    }
    case "d30": {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from, to: today, label: "Last 30 days", comparison: "previous-period" };
    }
    case "m3": {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 3);
      return { from, to: today, label: "Last 3 months", comparison: "previous-period" };
    }
    case "year": {
      return {
        from: new Date(now.getFullYear(), 0, 1),
        to: new Date(now.getFullYear(), 11, 31),
        label: "This year",
        comparison: "previous-year",
      };
    }
  }
}

export const customRange = (from: Date, to: Date): DateRange => ({
  from: startOfDay(from),
  to: startOfDay(to),
  label: rangeLabel(from, to),
  comparison: "previous-period",
});

/**
 * What this window is measured against.
 *
 * Inclusive days, so a 30-day window compares against the 30 days before it and
 * not 29 or 31 — an off-by-one here shows up as a delta that moves when nothing
 * has changed, which is worse than no delta at all.
 */
export function previousWindow(r: DateRange): DateRange {
  if (r.comparison === "previous-year") {
    const from = new Date(r.from.getFullYear() - 1, r.from.getMonth(), r.from.getDate());
    const to = new Date(r.to.getFullYear() - 1, r.to.getMonth(), r.to.getDate());
    return {
      from,
      to,
      label: r.label === "This season" ? "last season" : `${from.getFullYear()}`,
      comparison: "previous-year",
    };
  }
  const days = Math.round((r.to.getTime() - r.from.getTime()) / 86_400_000) + 1;
  const to = new Date(r.from);
  to.setDate(to.getDate() - 1);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from, to, label: `the ${days} days before`, comparison: "previous-period" };
}

export const withinRange = (iso: string, r: DateRange): boolean => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  /* `to` is an inclusive DAY, so the comparison runs to the end of it. */
  const end = new Date(r.to);
  end.setHours(23, 59, 59, 999);
  return t >= r.from.getTime() && t <= end.getTime();
};
