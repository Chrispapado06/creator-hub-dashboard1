/**
 * THE DAILY ACCLIMATISATION SCHEDULE — LAID ACROSS REAL DATES, DERIVING NO
 * RATE OF ITS OWN, AND INVENTING NO CAMP.
 *
 * ============================================================================
 * WHAT THIS IS BUILT ON, AND WHY IT MAY NOT RESTATE IT
 * ============================================================================
 *
 * `services/acclimatisation.ts` already holds ICEFALL's ascent-rate policy:
 * `ascentPaceFor(elevationM, history)` returns `maxSleepGainM`,
 * `restNightEveryM`, the guidance sentence, the caveat and the medical note. It
 * is tested, it is quoted to the athlete during onboarding, and it is pushed
 * into the coach's prompt. THOSE FIGURES HAVE ALREADY BEEN SHOWN TO THIS PERSON.
 *
 * So this module computes NO rate. It takes the two numbers that module
 * returns and lays them across the calendar dates of an actual trip. A schedule
 * that derived its own 450 m a night would contradict, on the mountain, a figure
 * the app gave the same athlete at signup — and the athlete would have no way to
 * tell which of the two ICEFALLs to believe.
 *
 * `narrowed`, `caveat` and `medicalNote` are carried through unchanged. The
 * caveat field exists precisely so it travels with the figure rather than being
 * remembered at each call site, and this is a call site.
 *
 * ============================================================================
 * THE HARD PART: THERE IS NO ITINERARY DATA, ANYWHERE, FOR ANY MOUNTAIN
 * ============================================================================
 *
 * ICEFALL holds no camps. Not for Everest, not for Kilimanjaro, not for
 * anything. `data/peaks.json` is a summit position and an elevation; there is
 * no route profile, no camp list and no per-night sleeping altitude in this
 * codebase for any peak in the world.
 *
 * A "daily acclimatisation schedule" that printed "Night 3 — Camp 2, 6,400 m"
 * would therefore be fiction with a mountain's name on it, and somebody could
 * plan against it. So this module does the only honest thing available:
 *
 *   IT DOES NOT SAY WHERE YOU WILL SLEEP. IT SAYS HOW HIGH YOU MAY SLEEP
 *   TONIGHT, COUNTED FROM WHERE YOU ACTUALLY SLEPT LAST NIGHT.
 *
 * That is a real schedule — it is the schedule the published guidance actually
 * describes — and every number in it is either a figure from the ascent-pace
 * policy or an altitude the athlete typed in. Where the athlete has typed in
 * nothing, there is no ceiling and the row says which night is missing. It never
 * fills a gap.
 *
 * ============================================================================
 * WHAT COUNTS AS A REST NIGHT, SINCE SOMETHING HAD TO
 * ============================================================================
 *
 * A night whose sleeping altitude is NOT HIGHER than the night before it. That
 * is a definition rather than a threshold ICEFALL invented, and it is stated on
 * the screen. The cumulative gain it resets is counted ABOVE
 * `ACCLIMATISATION_FLOOR_M`, because that is what the published rule counts.
 *
 * THE CHAIN BREAKS ON A GAP, AND SAYS SO. Cumulative gain is only meaningful
 * across consecutive recorded nights. One missing night and the running total
 * becomes null — not zero, not carried over — with the reason on the row. A
 * rest-night figure quietly reset by a forgotten entry is worse than no figure.
 *
 * ============================================================================
 * OFFLINE
 * ============================================================================
 *
 * Pure arithmetic over two plain inputs. No fetch, no store, no clock except
 * the `today` string the caller passes in, so the same trip and the same nights
 * always produce the same schedule. Imports `services/acclimatisation.ts`
 * (which imports nothing) and the trip's own date helpers, and nothing else.
 */

import {
  ACCLIMATISATION_FLOOR_M,
  ASCENT_PACE_RELEVANT_M,
  ascentPaceFor,
  type AltitudeIllnessHistory,
  type AscentPace,
} from "@/services/acclimatisation";

import { addDays, datesInclusive, type Trip, type TripNight } from "./trip";

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Why there is, or is not, a schedule. `missing | unreviewed | empty | usable`
 * was Phase 3's shape for exactly this job and the discipline carries over:
 * the absences are DIFFERENT absences and must not collapse into one null.
 */
export type ScheduleState =
  /** The trip names no objective, or the objective carried no elevation. */
  | "no-peak-elevation"
  /** The peak is below the elevation at which a staged schedule exists at all. */
  | "below-relevance"
  /** Dates that cannot make a trip. */
  | "unreadable-dates"
  | "usable";

export interface ScheduleNight {
  /** The calendar date of the night — the date you go to sleep. */
  date: string;
  /** Self-reported sleeping altitude, or null when none was recorded. */
  sleptAtM: number | null;
  /**
   * The highest this schedule describes sleeping tonight, or null.
   *
   * NULL IS COMMON AND IT IS NOT A FAILURE. It means the previous night has no
   * recorded altitude to count from, or that night was below the floor the
   * published rule counts above. `ceilingReason` always says which.
   */
  ceilingM: number | null;
  /** Why there is a ceiling, or why there is not. Safe to render alone. */
  ceilingReason: string;
  /**
   * Metres of sleeping gain above the floor since the last rest night, or null
   * when the chain of consecutive recorded nights is broken.
   */
  gainSinceRestM: number | null;
  /** True when the accumulated gain has reached `restNightEveryM`. */
  restNightDue: boolean;
  /** True when this night was not higher than the one before it. */
  wasRestNight: boolean;
  /**
   * Metres by which the recorded altitude exceeded the ceiling, or null.
   * Stated as arithmetic. It is not a symptom and carries no instruction.
   */
  exceededByM: number | null;
  isPast: boolean;
  isToday: boolean;
}

export interface TripSchedule {
  state: ScheduleState;
  /** One sentence saying what state this is and why. Always populated. */
  note: string;
  /** The policy's own output, or null when there is no schedule. */
  pace: AscentPace | null;
  nights: ScheduleNight[];
  /** From `pace`. Non-null exactly when the schedule was narrowed. */
  caveat: string | null;
  /** From `pace`. Non-null only for a reported serious episode. */
  medicalNote: string | null;
  /** Where the figures came from. Printed, so the screen cannot imply otherwise. */
  attribution: string;
  /** What ICEFALL does not know about this mountain. Always printed. */
  noItineraryNote: string;
}

/* -------------------------------------------------------------------------- */
/* Fixed wording                                                               */
/* -------------------------------------------------------------------------- */

const fmt = (m: number) => Math.round(m).toLocaleString("en-GB");

export const NO_ITINERARY_NOTE =
  "ICEFALL holds no camps, no route profile and no planned sleeping altitudes for any mountain — that data does not exist in this app. So this is not an itinerary and it does not know where you will be. It counts from the altitude you tell it you slept at, and where you have told it nothing it shows nothing.";

export const REST_NIGHT_DEFINITION =
  "A rest night here means a night no higher than the one before it. Gain is counted above 3,000 m, which is what the published guidance counts.";

/** Said whenever the trip has no elevation to work from. */
export const NO_ELEVATION_NOTE =
  "This trip has no objective elevation on record, so there is no ascent rate to apply and ICEFALL will not guess one. Attach the trip to an objective with an elevation, and the schedule appears.";

/* -------------------------------------------------------------------------- */
/* Build                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The schedule for a trip.
 *
 * @param trip    the trip, whose `peakElevationM` was copied at creation.
 * @param nights  every night recorded against this trip, at any date. The night
 *                BEFORE the trip starts is used when it is there, because the
 *                first night's ceiling counts from it and a walk-in that began
 *                the day before is the normal case.
 * @param history the athlete's declared altitude-illness answer, or null. This
 *                is a HEALTH DISCLOSURE — pass it only where the athlete is the
 *                person reading the result, exactly as `ascentPaceFor` requires.
 * @param today   today's calendar date, passed in so this stays pure.
 */
export function buildSchedule(
  trip: Trip,
  nights: TripNight[],
  history: AltitudeIllnessHistory | null,
  today: string,
): TripSchedule {
  const shell = {
    pace: null,
    nights: [] as ScheduleNight[],
    caveat: null,
    medicalNote: null,
    attribution: ATTRIBUTION_NONE,
    noItineraryNote: NO_ITINERARY_NOTE,
  };

  if (trip.peakElevationM === null) {
    return { ...shell, state: "no-peak-elevation", note: NO_ELEVATION_NOTE };
  }

  const pace = ascentPaceFor(trip.peakElevationM, history);
  if (pace === null) {
    /* `ascentPaceFor` returns null below ASCENT_PACE_RELEVANT_M, and its own
       header says why: on a low hill there is no schedule to make conservative
       and printing one would imply the mountain asks a question it does not.
       The empty state repeats that reason rather than drawing an empty grid. */
    return {
      ...shell,
      state: "below-relevance",
      note: `${trip.peakName ?? "This objective"} tops out at ${fmt(trip.peakElevationM)} m. Staged sleeping altitude is counted above ${fmt(ACCLIMATISATION_FLOOR_M)} m and ICEFALL describes no schedule below ${fmt(ASCENT_PACE_RELEVANT_M)} m, so there is none here. That is not a clean bill of health — it means this mountain does not ask the acclimatisation question, not that nothing else can go wrong on it.`,
    };
  }

  const dates = datesInclusive(trip.startDate, trip.endDate);
  if (dates.length === 0) {
    return {
      ...shell,
      state: "unreadable-dates",
      note: "This trip's start and end dates do not make a window ICEFALL can lay days across.",
    };
  }

  const byDate = new Map<string, TripNight>();
  for (const n of nights) byDate.set(n.date, n);

  const rows: ScheduleNight[] = [];

  /* Running state across consecutive recorded nights. `gainSinceRest` is null
     the moment the chain breaks — see the header. */
  let gainSinceRest: number | null = null;
  let chainAlive = false;

  for (const date of dates) {
    const rec = byDate.get(date) ?? null;
    const prevDate = addDays(date, -1);
    const prev = byDate.get(prevDate) ?? null;

    /* ---- tonight's ceiling ------------------------------------------------ */
    let ceilingM: number | null = null;
    let ceilingReason: string;

    if (prev === null) {
      ceilingReason =
        date === trip.startDate
          ? `No sleeping altitude is recorded for the night before the trip (${prevDate}), so there is nothing to count tonight's ceiling from. Record where you slept and the ceiling appears.`
          : `No sleeping altitude is recorded for ${prevDate}, so ICEFALL has nothing to add tonight's ceiling to. It will not estimate the missing night.`;
    } else if (prev.sleptAtM < ACCLIMATISATION_FLOOR_M) {
      ceilingReason = `Last night was ${fmt(prev.sleptAtM)} m, below the ${fmt(ACCLIMATISATION_FLOOR_M)} m the published rule counts sleeping gain above. ICEFALL derives no ceiling from a night below the floor.`;
    } else {
      ceilingM = prev.sleptAtM + pace.maxSleepGainM;
      ceilingReason = `You slept at ${fmt(prev.sleptAtM)} m on ${prevDate}, and this schedule gains no more than ${fmt(pace.maxSleepGainM)} m of sleeping altitude a night above ${fmt(ACCLIMATISATION_FLOOR_M)} m.`;
    }

    /* ---- the rest-night ledger -------------------------------------------- */
    let wasRestNight = false;

    if (rec !== null && prev !== null) {
      wasRestNight = rec.sleptAtM <= prev.sleptAtM;
      if (wasRestNight) {
        gainSinceRest = 0;
      } else {
        const gained = Math.max(0, rec.sleptAtM - Math.max(prev.sleptAtM, ACCLIMATISATION_FLOOR_M));
        gainSinceRest = chainAlive && gainSinceRest !== null ? gainSinceRest + gained : gained;
      }
      chainAlive = true;
    } else if (rec !== null && prev === null) {
      /* A recorded night with no recorded night before it. The chain starts
         here and carries no history — stated as null rather than as zero,
         because zero would claim a rest night nobody took. */
      gainSinceRest = null;
      chainAlive = false;
    } else if (rec === null) {
      /* Nothing recorded for this night: the chain is broken from here on. */
      gainSinceRest = null;
      chainAlive = false;
    }

    const restNightDue =
      gainSinceRest !== null && gainSinceRest >= pace.restNightEveryM && !wasRestNight;

    const exceededByM =
      rec !== null && ceilingM !== null && rec.sleptAtM > ceilingM
        ? rec.sleptAtM - ceilingM
        : null;

    rows.push({
      date,
      sleptAtM: rec?.sleptAtM ?? null,
      ceilingM,
      ceilingReason,
      gainSinceRestM: gainSinceRest,
      restNightDue,
      wasRestNight,
      exceededByM,
      isPast: date < today,
      isToday: date === today,
    });
  }

  return {
    state: "usable",
    note: pace.guidance,
    pace,
    nights: rows,
    caveat: pace.caveat,
    medicalNote: pace.medicalNote,
    attribution: attributionFor(pace),
    noItineraryNote: NO_ITINERARY_NOTE,
  };
}

const ATTRIBUTION_NONE =
  "No ascent-rate figures apply to this trip, so none are shown.";

function attributionFor(pace: AscentPace): string {
  const base = `Every figure on this schedule is ${fmt(pace.maxSleepGainM)} m a night and a rest night every ${fmt(pace.restNightEveryM)} m, taken from ICEFALL's ascent-pace policy — the same figures this app has shown you since you set the objective. ICEFALL derives no rate of its own here.`;
  return pace.narrowed
    ? `${base} They are the conservative end of the published range because you reported altitude illness before.`
    : base;
}

/* -------------------------------------------------------------------------- */
/* The one row the screen leads with                                           */
/* -------------------------------------------------------------------------- */

/**
 * Tonight, in one sentence — or the reason there is no sentence.
 *
 * Separate from the grid because the grid is for planning and this is the line
 * somebody reads at six in the evening in a tent. It NEVER invents a ceiling
 * the grid does not have; it is the same row, said in words.
 */
export function tonight(schedule: TripSchedule, today: string): ScheduleNight | null {
  return schedule.nights.find((n) => n.date === today) ?? null;
}

export function describeTonight(schedule: TripSchedule, today: string): string {
  if (schedule.state !== "usable") return schedule.note;
  const row = tonight(schedule, today);
  if (!row) return "Today is not inside this trip's dates, so this schedule has no row for it.";
  if (row.ceilingM === null) return row.ceilingReason;

  const rest = row.restNightDue
    ? ` A rest night is due: you have gained ${fmt(row.gainSinceRestM ?? 0)} m of sleeping altitude since the last night that was not higher than the one before it, and this schedule takes an extra night at the same altitude for roughly every ${fmt(schedule.pace?.restNightEveryM ?? 0)} m.`
    : "";

  return `Sleep no higher than ${fmt(row.ceilingM)} m tonight.${rest} ${row.ceilingReason}`;
}
