import { activityById, ACTIVITY_TYPES } from "./activities";
import { finalizeActivity } from "./finalize";
import { parseLocalClock, stampStartTime } from "./timeOfDay";
import type { ActivityTypeId, Capabilities, RecordedActivity } from "./types";

/**
 * AN ACTIVITY THE ATHLETE REPORTED, WRITTEN AS A REPORT.
 *
 * ============================================================================
 * WHY THIS IS NOT JUST A CALL TO `saveActivity`
 * ============================================================================
 *
 * The coach can now be told "I did about two hours with 600 up this morning"
 * and record it. That session is real training and it has to reach the load
 * curve, the week's totals and the plan's preparation — an athlete who trains
 * and tells the coach about it should not have the coach reply from a picture
 * of their week that the session is missing from.
 *
 * But what arrived was a SENTENCE. Nothing measured it. So this builds a
 * `RecordedActivity` whose every unmeasured field is `null` rather than zero,
 * stamps it `origin: { kind: "manual" }`, and hands it to `finalizeActivity` —
 * the single seam every other write goes through, which is where the bar on
 * personal bests and achievements lives. Calling `saveActivity` directly would
 * skip that bar, skip `invalidateFeed()` and put a reported figure in the
 * record book. `tracking/import.ts` makes the same argument for the same seam.
 *
 * ============================================================================
 * ZERO IS A MEASUREMENT AND WE DO NOT HAVE ONE
 * ============================================================================
 *
 * `avgHeartRateBpm: null`, `maxAltitudeM: null`, `temperatureC: null` and the
 * rest are not oversights. A zero heart rate is a reading; an absent one is the
 * truth, and the summary screen already renders a dash for `null` rather than
 * claiming a figure. The two places a number IS derived — average speed and
 * pace — are derived only when a distance was actually given, because speed
 * over an unknown distance is not a slower speed, it is no speed at all.
 *
 * `points: []` is the same statement about the route: there is no track, and
 * `ActivitySummary` says so in words instead of drawing one.
 *
 * `movingSec === durationSec` is the one place a figure is filled in, and it is
 * filled in with the athlete's own: they reported how long they were out, and
 * ICEFALL has no basis for deciding that some of it was standing still. The
 * `capabilities` block below records that nothing was sensed, so anything
 * downstream that cares can tell this apart from a recording in which the
 * phone genuinely measured a moving time.
 */

/** Nothing on the device took part. Every capability is false, and truthfully. */
const NOTHING_SENSED: Capabilities = {
  gps: false,
  barometricAltitude: false,
  heartRate: false,
  cadence: false,
  power: false,
  temperature: false,
};

export interface ManualActivityInput {
  /** Calendar date, `YYYY-MM-DD`. */
  date: string;
  /**
   * The local clock time they started, `HH:MM`, or absent because nobody said.
   *
   * WHEN IT IS ABSENT THE APP INFERS ONE AND LABELS IT AS INFERRED — see
   * `inferredStart` below. An inferred time is never quoted back as though the
   * athlete had given it, and the coach is told which sessions it may reason
   * about; it may not conclude that somebody trains at midday from a string of
   * sessions in which midday is the app's own guess.
   */
  timeLocal?: string;
  activityTypeId: string;
  durationMin: number;
  distanceKm?: number;
  ascentM?: number;
  /** Who typed it. The summary screen words itself differently for each. */
  source: "coach" | "athlete";
}

/** True when the catalogue holds this id — checked before anything is written. */
export function isKnownActivityType(id: string): id is ActivityTypeId {
  return ACTIVITY_TYPES.some((t) => t.id === id);
}

/**
 * WHERE TO PUT A SESSION NOBODY TIMED.
 *
 * MIDDAY, not midnight and not "now". Midnight belongs to two calendar days
 * depending on the timezone the figure is read back in, and this app keys the
 * training plan, the week's totals and `activitySatisfies` on a local date
 * string. Midday is unambiguously inside the day the athlete named, in every
 * timezone anyone will open this in.
 *
 * WITH ONE CORRECTION, which the clock made necessary the moment start times
 * started meaning something: a session reported at nine in the morning for
 * TODAY would be stamped at midday and end at two in the afternoon — a
 * recording that finishes in the future. So an inferred start on a day that is
 * still running is pulled back until the session ends now, and never earlier
 * than midnight of the day itself. A past day is untouched: midday stands.
 *
 * The result is labelled `inferred` on the record. It is the app's placement,
 * not the athlete's statement, and nothing may read it as a training habit.
 */
function inferredStart(
  year: number,
  monthIndex: number,
  day: number,
  durationSec: number,
  now: Date,
): Date {
  const midday = new Date(year, monthIndex, day, 12, 0, 0, 0);
  const midnight = new Date(year, monthIndex, day, 0, 0, 0, 0);
  const latest = now.getTime() - durationSec * 1000;
  if (midday.getTime() <= latest) return midday;
  return new Date(Math.max(midnight.getTime(), latest));
}

/**
 * Build the record. PURE and exported separately from the write so a screen can
 * show the athlete exactly what it is about to store before it stores it —
 * which is what the coach's confirmation step renders.
 *
 * `now` is a parameter for the same reason it is everywhere else in this
 * codebase: a function that reads the clock cannot be tested and cannot be
 * shown to be deterministic.
 */
export function buildManualActivity(
  input: ManualActivityInput,
  now = new Date(),
): RecordedActivity {
  const type = activityById(input.activityTypeId as ActivityTypeId);
  const durationSec = Math.max(60, Math.round(input.durationMin * 60));
  const distanceM = input.distanceKm !== undefined ? Math.round(input.distanceKm * 1000) : 0;

  const [y, m, d] = input.date.split("-").map(Number);
  const stated = parseLocalClock(input.timeLocal);
  const started =
    stated === null
      ? inferredStart(y, (m ?? 1) - 1, d ?? 1, durationSec, now)
      : new Date(y, (m ?? 1) - 1, d ?? 1, Math.floor(stated / 60), stated % 60, 0, 0);
  const ended = new Date(started.getTime() + durationSec * 1000);

  return {
    id: `manual-${started.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    activityTypeId: type.id,
    /* THE APP'S TITLE, FROM THE CATALOGUE — not a title a model wrote. Rule 1:
       the model chose which activity this was; the words come from here. */
    title: type.label,
    startedAt: started.toISOString(),
    endedAt: ended.toISOString(),
    /* The zone is the device's, because the athlete is reporting a session they
       did where they are. `reported` when they gave a clock time and `inferred`
       when the app placed it — the distinction is carried on the record itself
       so no screen and no prompt has to re-derive it. */
    ...stampStartTime(started, stated === null ? "inferred" : "reported"),
    simulated: false,
    origin: { kind: "manual", enteredAt: now.toISOString(), source: input.source },

    durationSec,
    movingSec: durationSec,
    distanceM,
    elevationGainM: input.ascentM !== undefined ? Math.round(input.ascentM) : 0,
    elevationLossM: 0,
    maxAltitudeM: null,
    minAltitudeM: null,
    avgSpeedMps: distanceM > 0 ? distanceM / durationSec : null,
    avgPaceSecPerKm: distanceM > 0 ? durationSec / (distanceM / 1000) : null,
    avgHeartRateBpm: null,
    maxHeartRateBpm: null,
    avgCadenceSpm: null,
    calories: null,
    verticalRateMPerH: null,
    temperatureC: null,

    points: [],
    splits: [],
    capabilities: NOTHING_SENSED,
  };
}

/**
 * Write it, through the one seam. Returns the stored record so the caller can
 * link to it.
 */
export function logManualActivity(input: ManualActivityInput, now = new Date()): RecordedActivity {
  return finalizeActivity(buildManualActivity(input, now)).activity;
}
