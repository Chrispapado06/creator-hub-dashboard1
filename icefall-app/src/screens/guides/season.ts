import {
  MONTHS,
  seasonFor,
  type Month,
  type MonthRating,
  type MountainSeasonRecord,
  NO_SEASON_RECORDED,
} from "@/data/mountainSeason";

/**
 * The mountain's own climbing season, read for the guide search's date picker.
 *
 * NOT PER-OPERATOR DATES. The owner asked for "the date range(s) that guide
 * operators actually run trips on that mountain" — nothing in this app holds
 * one company's own departure dates (`Trip.departures` in `@/services/operators`
 * is invented demo data, flagged as such, and belongs to a different screen).
 * What ICEFALL does hold, in `@/data/mountainSeason.ts`, is the mountain's own
 * sourced season — a hut's opening dates, a park's published window, a
 * government's royalty calendar — which is the nearest honest stand-in: guides
 * do not run trips outside the season the mountain itself is open on. Where no
 * source exists for a mountain, this module says so rather than guessing one.
 */

export { NO_SEASON_RECORDED };

/** A month's status, simplified to what the calendar needs to colour a day. */
export type SeasonTone = "in" | "edge" | "off";

const TONE_OF: Record<MonthRating, SeasonTone> = {
  best: "in",
  possible: "edge",
  avoid: "off",
};

export function seasonRecordFor(mountainId: string | undefined): MountainSeasonRecord | null {
  return seasonFor(mountainId);
}

/** Every rated month, mapped to its tone. A month no source speaks to is absent. */
function toneByMonth(record: MountainSeasonRecord): Map<Month, SeasonTone> {
  const map = new Map<Month, SeasonTone>();
  for (const w of record.windows) for (const m of w.months) map.set(m, TONE_OF[w.rating]);
  return map;
}

/**
 * The twelve months, January first, each with the tone the record gives it —
 * `"off"` both for a source-confirmed shut season and for a month no source
 * rates at all, because a date picker only needs to know whether to offer the
 * day, not why not.
 */
export function monthTones(record: MountainSeasonRecord | null): SeasonTone[] {
  if (!record) return MONTHS.map(() => "off");
  const byMonth = toneByMonth(record);
  return MONTHS.map((m) => byMonth.get(m) ?? "off");
}

/** Tone for a single JS month index (0 = January). */
export function toneForMonthIndex(tones: SeasonTone[], month0: number): SeasonTone {
  return tones[month0] ?? "off";
}

/**
 * The twelve months, January first, with the source's own rating — `null`
 * where no source rates that month at all. Unlike `monthTones`, this keeps
 * "season shut" and "not recorded" apart, because a label has to say which
 * one it means; a calendar cell does not.
 */
export function monthRatings(record: MountainSeasonRecord | null): (MonthRating | null)[] {
  if (!record) return MONTHS.map(() => null);
  const map = new Map<Month, MonthRating>();
  for (const w of record.windows) for (const m of w.months) map.set(m, w.rating);
  return MONTHS.map((m) => map.get(m) ?? null);
}

/**
 * One grounding sentence for the block above the calendar — the actual
 * sourced reason, not a summary of it. Prefers the "best"-rated window
 * (Kilimanjaro has none, so falls back to the first "possible" one); returns
 * null only when the record itself has no windows, which none currently do.
 */
export function primarySeasonSentence(
  record: MountainSeasonRecord | null,
): { reason: string; sourceLabel: string; sourceUrl: string } | null {
  if (!record) return null;
  const window =
    record.windows.find((w) => w.rating === "best") ??
    record.windows.find((w) => w.rating === "possible") ??
    record.windows[0];
  if (!window) return null;
  return { reason: window.reason, sourceLabel: window.source.label, sourceUrl: window.source.url };
}
