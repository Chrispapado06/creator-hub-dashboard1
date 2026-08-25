import { known, unavailable } from "@/coach/types";
import type { Score, Unavailable } from "@/coach/types";
import { assessPeak } from "@/services/peakAssessment";
import type { PeakAssessment } from "@/services/peakAssessment";
import { activityById } from "@/tracking/activities";
import type { ActivityTypeId, RecordedActivity } from "@/tracking/types";

/**
 * Readiness for a specific objective, in four dimensions.
 *
 * Every other coach module asks "how does today look". This one asks the far
 * more consequential question — "how do I stand against that mountain" — and the
 * honest answer is that ICEFALL can only see one of the four things that decide
 * it.
 *
 *   FITNESS      is derivable. Ascent, sustained hours and week-on-week volume
 *                are recorded, and they are a real if partial answer.
 *   TECHNICAL    is not. A phone cannot see whether you can place a screw, lead
 *                a pitch, arrest on hard snow or run a crevasse rescue. Nothing
 *                in a running history implies any of it, and this module will
 *                never let volume stand in for competence.
 *   ALTITUDE     is not. The highest point a session reached is a measurement;
 *                how a body responds to altitude on a given trip is not, and it
 *                is not predictable from history — the same person tolerates it
 *                differently from one attempt to the next.
 *   EXPERIENCE   is partly reported, partly logged, never verified.
 *
 * So the two dimensions a phone cannot see default to null with a reason, and
 * the UI's job is to ask rather than to fill the gap. That is the whole design.
 *
 * `overall` is deliberately hostile to the reading "you are ready":
 *
 *   1. It is the WEAKEST applicable dimension, not an average. An athlete with
 *      exceptional endurance and no ice skills is not two-thirds prepared for an
 *      ice route; they are not prepared for it, and a mean would hide that.
 *   2. It is withheld entirely — null, with the explanation carried on
 *      `biggestGap` — whenever any dimension the objective actually depends on
 *      is unknown. A number assembled from the parts that happen to be known
 *      reads as a verdict on the whole mountain.
 *   3. It is capped on anything needing a guide, and capped harder at altitude,
 *      because the last quarter of that judgement is made in person by someone
 *      qualified, on the day, with the conditions in front of them.
 *
 * Nothing here is medical, and nothing here clears anyone to climb anything.
 */

/* -------------------------------------------------------------------------- */
/* Public shape                                                                */
/* -------------------------------------------------------------------------- */

export type Dimension = "fitness" | "technical" | "altitude" | "experience";

/**
 * One checkable demand of the objective.
 *
 * `met` has three states and they are not interchangeable: `true` we have
 * evidence for, `false` we have contrary evidence for, and `null` means nobody
 * has told us — which is the state most technical requirements sit in, and the
 * state the UI should turn into a question rather than a cross.
 */
export interface Requirement {
  label: string;
  met: boolean | null;
  note: string;
}

/**
 * One dimension's result.
 *
 * Two distinct null cases, and the difference matters to the UI:
 *   - `score.value === null` WITH a `reason` — the dimension applies to this
 *     objective and we do not know it. Ask for it.
 *   - `score.value === null` with NO `reason` — the dimension does not apply to
 *     this class of objective at all (altitude on a 900 m hill). `summary` says
 *     so; there is nothing to ask for.
 */
export interface DimensionResult {
  id: Dimension;
  label: string;
  score: Score;
  summary: string;
  requirements: Requirement[];
  /**
   * Where the number came from. "recorded" means ICEFALL observed it;
   * "self-reported" means the athlete told us. A screen MUST surface the
   * difference — the readiness funnel scores a stranger who has recorded
   * nothing, and presenting their own estimate back to them as a measurement
   * would be the most consequential lie this product could tell.
   */
  provenance?: "recorded" | "self-reported";
}

export interface ObjectiveReadiness {
  /** The weakest applicable dimension, or null when one of them is unknown. */
  overall: Score;
  dimensions: DimensionResult[];
  /**
   * What most limits this objective. When `overall` is null this is never null,
   * and its `recommendation` carries the explanation for the withheld number —
   * so a UI that renders the gap can never render a mystery instead.
   */
  biggestGap: { id: Dimension; label: string; recommendation: string } | null;
  /** Non-null whenever the class of objective needs a certified guide. */
  professionalAdvice: string | null;
  disclaimer: string;
}

/**
 * Shown wherever this assessment appears. It is not decoration: the whole
 * module is only defensible alongside it.
 */
export const OBJECTIVE_READINESS_DISCLAIMER =
  "This is a planning aid. It is not a determination that you are competent or safe to attempt this mountain, and it does not clear you to go. ICEFALL judges the class of objective from elevation and position, and it can only see the sessions you record and what you choose to tell it — not the route you intend, not the conditions on the day, not your technical competence, and not how your body will respond to altitude. Nothing here is medical advice. The assessment that counts is made in person by an IFMGA/UIAGM-certified guide, and by you on the day: turning back is always available and always cheap.";

/* -------------------------------------------------------------------------- */
/* Windows and thresholds                                                      */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** Twelve weeks — a build block. Fitness is a claim about now, not about March. */
const FITNESS_WINDOW_DAYS = 84;

/** Below these, the recorded work describes a fortnight rather than a build. */
const MIN_FITNESS_SESSIONS = 4;
const MIN_FITNESS_HISTORY_DAYS = 21;

/**
 * Days out on mountain ground are counted over two years, not twelve weeks.
 * Skills and mileage on a mountain do not evaporate in a season the way aerobic
 * fitness does — though they do decay, which is why the window is not open.
 */
const MOUNTAIN_WINDOW_DAYS = 730;

/** Below this, recorded mountain days are anecdotes rather than a pattern. */
const MIN_EXPOSURE_DAYS = 3;
/** Where the exposure-only score reaches its (low) ceiling. */
const EXPOSURE_FULL_DAYS = 12;

/**
 * Hard ceilings on what each class of evidence may ever be worth.
 *
 * These are the honesty mechanism of this module. A self-declared skill is
 * still self-declared, and a day labelled "Alpine Climbing" in a picker tells
 * ICEFALL nothing about the ground, the grade, or whether the athlete led any
 * of it — so neither may ever produce a confident-looking number.
 */
const SELF_REPORT_CEILING = 80;
const EXPOSURE_CEILING = 40;

/**
 * Reaching an altitude once is not being acclimatised for it: acclimatisation
 * is lost within weeks at low elevation, and the itinerary that rebuilds it is
 * something ICEFALL cannot see. On anything demanding staged acclimatisation,
 * altitude therefore stops short of full marks whatever the history says.
 */
const ALTITUDE_ACCLIMATISATION_CEILING = 80;

/**
 * Altitude is assessed from 3,000 m, the elevation at which peakAssessment
 * itself starts asking about sleeping high. Below it the dimension does not
 * apply rather than scoring perfectly, because a full bar for "altitude" on a
 * hill walk is a number pretending to be a finding.
 */
const ALTITUDE_RELEVANT_M = 3000;

/**
 * Below this, altitude is not the limiter for most people, so progress towards
 * a high objective is measured from here rather than from sea level. Someone
 * who has been to 3,000 m is not "halfway ready" for 6,000 m.
 */
const ALTITUDE_BASELINE_M = 2000;

/** Barometric and GPS altitude both drift; these only reject impossible values. */
const ALTITUDE_PLAUSIBLE_MIN_M = -500;
const ALTITUDE_PLAUSIBLE_MAX_M = 8900;

/** Data hygiene only, matching src/coach/load.ts. Not reward capping. */
const MAX_PLAUSIBLE_ASCENT_M = 8000;
const MAX_PLAUSIBLE_HOURS = 36;

/**
 * Caps on the composite itself.
 *
 * On a guided-class objective the remaining judgement belongs to the guide and
 * to the conditions, and ICEFALL is not entitled to award it. Above 6,000 m the
 * objective is decided by the acclimatisation schedule, the weather window, the
 * fixed lines and the operator — none of which are visible here — so the cap
 * falls further.
 */
const OVERALL_GUIDED_CEILING = 75;
const OVERALL_HIGH_ALTITUDE_CEILING = 60;

/** At or above this, a dimension is not the thing holding the objective back. */
const STRONG_DIMENSION = 75;

/** Shortest self-reported skill string worth matching on. Avoids silly hits. */
const MIN_CLAIM_CHARS = 4;

/**
 * Disciplines that put an athlete on mountain ground.
 *
 * Indoor climbing and bouldering are excluded on purpose. They build real
 * qualities — see exercises.ts — but a climbing wall teaches nothing about
 * glacier travel, rockfall, weather or turnaround discipline, and counting a
 * gym session as mountain exposure would be exactly the inference this module
 * exists to refuse.
 */
const MOUNTAIN_ACTIVITY_IDS: ActivityTypeId[] = [
  "mountaineering",
  "alpine-climbing",
  "scrambling",
  "ski-mountaineering",
  "ski-touring",
  "rock-climbing",
];

/* -------------------------------------------------------------------------- */
/* Training reference figures                                                  */
/* -------------------------------------------------------------------------- */

interface TrainingReference {
  /** Single-day ascent ICEFALL wants demonstrated in training first. */
  dayAscentM: number;
  /** Sustained hours of movement in one day, likewise. */
  sustainedHours: number;
  /** Weekly ascent a build for this class of objective is expected to hold. */
  weeklyAscentM: number;
}

/**
 * ICEFALL's own training benchmarks for each class of objective.
 *
 * READ THIS BEFORE CHANGING A NUMBER. These are NOT route data. They do not
 * claim how much a peak climbs, how long it takes, or what proportion of people
 * summit — ICEFALL holds none of that for a peak it has not curated, and
 * inventing it would be a fabrication with real consequences. They are the
 * capability the coach wants an athlete to have shown in training before a
 * mountain of this class, and like every ceiling in this codebase they are the
 * point at which a component stops gaining rather than a target to chase. There
 * is no reward here for exceeding them.
 *
 * The figures plateau above band 5 for a reason that is not laziness: past that
 * point raw vertical stops being the limiter and altitude, weather windows and
 * logistics take over. Scaling the numbers upwards would imply that more
 * training is what stands between an athlete and an 8,000 m peak, which is both
 * false and dangerous.
 */
const TRAINING_REFERENCE: Record<PeakAssessment["band"], TrainingReference> = {
  1: { dayAscentM: 400, sustainedHours: 3, weeklyAscentM: 400 },
  2: { dayAscentM: 700, sustainedHours: 5, weeklyAscentM: 700 },
  3: { dayAscentM: 1000, sustainedHours: 7, weeklyAscentM: 1000 },
  4: { dayAscentM: 1200, sustainedHours: 8, weeklyAscentM: 1200 },
  5: { dayAscentM: 1400, sustainedHours: 10, weeklyAscentM: 1500 },
  6: { dayAscentM: 1500, sustainedHours: 12, weeklyAscentM: 1800 },
  7: { dayAscentM: 1600, sustainedHours: 12, weeklyAscentM: 2000 },
};

/**
 * How much each fitness signal moves the dimension.
 *
 * The single long day carries the most because that is the shape of the event:
 * a mountain is one continuous effort, and weekly volume can be accumulated
 * entirely in thirty-minute sessions that never once test what the objective
 * tests. An athlete with excellent weekly ascent and a longest day of ninety
 * minutes should not read as two-thirds prepared for a twelve-hour summit day.
 */
const FITNESS_WEIGHTS = { volume: 0.3, bigDay: 0.4, sustained: 0.3 } as const;

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const fraction = (n: number): Score => known(clamp01(n) * 100);
const capped = (value: number, ceiling: number): Score => known(Math.min(value, ceiling));
const metres = (n: number) => `${Math.round(n).toLocaleString("en-GB")} m`;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Local calendar key, so two sessions in one day are one day out. */
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  // "map and compass and head torch" reads as a mistake, so a list whose own
  // items contain "and" is joined with commas alone.
  if (items.some((i) => / and /.test(i))) return items.join(", ");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** For a list that opens a sentence. */
function sentenceList(items: string[]): string {
  const joined = joinList(items);
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Band depends on elevation alone in peakAssessment — latitude only shapes the
 * season window, which this module does not use. Passing 0 for an unknown
 * latitude therefore changes nothing we read, and is preferable to duplicating
 * the band table here where the two could drift apart.
 */
function bandForElevation(elevationM: number): PeakAssessment["band"] {
  return assessPeak(elevationM, 0).band;
}

/* -------------------------------------------------------------------------- */
/* Evidence from recorded activity                                             */
/* -------------------------------------------------------------------------- */

interface DayTotals {
  ascentM: number;
  hours: number;
}

interface Evidence {
  /** Sessions inside the fitness window, simulated recordings already removed. */
  windowSessions: number;
  /** Simulated recordings dropped from every figure here. */
  simulatedDropped: number;
  /** Days from the first real recorded session to today. */
  observedDays: number | null;
  weeklyAscentM: number | null;
  biggestDayAscentM: number | null;
  longestDayHours: number | null;
  /** Distinct days on mountain-discipline ground inside MOUNTAIN_WINDOW_DAYS. */
  mountainDays: number;
  /** The disciplines behind those days, named so the note can be checked. */
  mountainDisciplines: string[];
  /** Highest altitude a recorded session actually reached. */
  highestRecordedAltitudeM: number | null;
}

/** Ascent, rejecting only figures no session can produce. */
function ascentOf(a: RecordedActivity): number {
  const gain = a.elevationGainM;
  if (!Number.isFinite(gain) || gain <= 0) return 0;
  return Math.min(gain, MAX_PLAUSIBLE_ASCENT_M);
}

/** Moving time where it exists, elapsed otherwise — as load.ts does. */
function hoursOf(a: RecordedActivity): number {
  const sec = Number.isFinite(a.movingSec) && a.movingSec > 0 ? a.movingSec : a.durationSec;
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.min(sec / 3600, MAX_PLAUSIBLE_HOURS);
}

/**
 * One pass over the feed. Everything the dimensions quote is derived here, so
 * the summaries and the scores cannot drift apart.
 *
 * Simulated recordings are excluded from all of it. Load and points count them
 * with a label attached, which is right for training volume; but this module is
 * being asked whether someone has stood on that kind of ground, and a labelled
 * simulation is not evidence that they have.
 */
function readEvidence(activities: RecordedActivity[], now: Date): Evidence {
  const today = startOfDay(now);
  const windowStart = today.getTime() - (FITNESS_WINDOW_DAYS - 1) * DAY_MS;
  const mountainStart = today.getTime() - MOUNTAIN_WINDOW_DAYS * DAY_MS;

  const windowDays = new Map<string, DayTotals>();
  const mountainDayKeys = new Set<string>();
  const disciplines = new Set<string>();

  let simulatedDropped = 0;
  let windowSessions = 0;
  let firstSeen: number | null = null;
  let highestAltitude: number | null = null;

  for (const a of activities) {
    const started = new Date(a.startedAt).getTime();
    // An unparseable or future-dated timestamp is dropped rather than coerced.
    // Guessing a date would credit the athlete with a day they did not have.
    if (!Number.isFinite(started)) continue;
    if (started > now.getTime() + DAY_MS) continue;

    if (a.simulated === true) {
      simulatedDropped++;
      continue;
    }

    if (firstSeen === null || started < firstSeen) firstSeen = started;

    const alt = a.maxAltitudeM;
    if (
      typeof alt === "number" &&
      Number.isFinite(alt) &&
      alt > ALTITUDE_PLAUSIBLE_MIN_M &&
      alt < ALTITUDE_PLAUSIBLE_MAX_M &&
      (highestAltitude === null || alt > highestAltitude)
    ) {
      highestAltitude = alt;
    }

    if (started >= mountainStart && MOUNTAIN_ACTIVITY_IDS.includes(a.activityTypeId)) {
      mountainDayKeys.add(dayKey(started));
      disciplines.add(activityById(a.activityTypeId).label);
    }

    if (started >= windowStart) {
      windowSessions++;
      const key = dayKey(started);
      const totals = windowDays.get(key) ?? { ascentM: 0, hours: 0 };
      totals.ascentM += ascentOf(a);
      totals.hours += hoursOf(a);
      windowDays.set(key, totals);
    }
  }

  const observedDays =
    firstSeen === null
      ? null
      : Math.max(
          1,
          Math.round((today.getTime() - startOfDay(new Date(firstSeen)).getTime()) / DAY_MS) + 1,
        );

  const days = [...windowDays.values()];
  const totalAscent = days.reduce((sum, d) => sum + d.ascentM, 0);

  // Weekly volume is averaged over the span actually observed, never over the
  // full twelve weeks. Padding the front with weeks ICEFALL was not present for
  // would report an athlete of six weeks' standing as half as consistent.
  const spanDays = observedDays === null ? null : Math.min(FITNESS_WINDOW_DAYS, observedDays);

  return {
    windowSessions,
    simulatedDropped,
    observedDays,
    weeklyAscentM: spanDays === null || days.length === 0 ? null : totalAscent / (spanDays / 7),
    biggestDayAscentM: days.length === 0 ? null : Math.max(...days.map((d) => d.ascentM)),
    longestDayHours: days.length === 0 ? null : Math.max(...days.map((d) => d.hours)),
    mountainDays: mountainDayKeys.size,
    mountainDisciplines: [...disciplines],
    highestRecordedAltitudeM: highestAltitude,
  };
}

/* -------------------------------------------------------------------------- */
/* Dimension: fitness                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The one dimension a phone genuinely answers.
 *
 * Three signals, all recorded: how much vertical a week the athlete is holding,
 * the biggest single day they have put together, and the longest they have kept
 * moving. Note what is deliberately absent — nothing here rewards training
 * more, and nothing suggests closing a gap quickly. A shortfall against a
 * mountain is closed over months or the objective moves; those are the only two
 * honest options and both appear in the copy.
 */
interface SelfReportedFitness {
  weeklyAscentM?: number;
  biggestDayAscentM?: number;
  longestDayHours?: number;
}

/** True when the athlete gave us at least one usable figure. */
function hasSelfReport(f?: SelfReportedFitness): f is SelfReportedFitness {
  if (!f) return false;
  return [f.weeklyAscentM, f.biggestDayAscentM, f.longestDayHours].some(
    (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
}

/**
 * Scores what the athlete told us, for the case where ICEFALL has observed
 * nothing at all. This is how the readiness test can say anything useful to
 * someone who installed the app ten minutes ago.
 *
 * It is deliberately capped below a recorded score: a claim is not evidence,
 * and the ceiling is what stops the funnel handing out a confident number to
 * someone who has simply answered generously.
 */
function selfReportedFitness(f: SelfReportedFitness, ref: TrainingReference): DimensionResult {
  const label = "Fitness";
  const SELF_REPORT_CEILING = 70;

  const say = (
    v: number | undefined,
    target: number,
    unit: (n: number) => string,
  ): Requirement["met"] => (typeof v === "number" && Number.isFinite(v) ? v >= target : null);

  const requirements: Requirement[] = [
    {
      label: `A single day of ${metres(ref.dayAscentM)} ascent`,
      met: say(f.biggestDayAscentM, ref.dayAscentM, metres),
      note:
        typeof f.biggestDayAscentM === "number"
          ? `You told us your biggest day so far climbed about ${metres(f.biggestDayAscentM)}.`
          : "Not answered.",
    },
    {
      label: `${ref.sustainedHours} hours of sustained movement in one day`,
      met: say(f.longestDayHours, ref.sustainedHours, (n) => `${n} h`),
      note:
        typeof f.longestDayHours === "number"
          ? `You told us your longest day on the move was about ${f.longestDayHours} hours.`
          : "Not answered.",
    },
    {
      label: `${metres(ref.weeklyAscentM)} of ascent a week, held rather than spiked`,
      met: say(f.weeklyAscentM, ref.weeklyAscentM, metres),
      note:
        typeof f.weeklyAscentM === "number"
          ? `You told us you are climbing roughly ${metres(f.weeklyAscentM)} a week.`
          : "Not answered.",
    },
  ];

  const ratio = (v: number | undefined, target: number) =>
    typeof v === "number" && Number.isFinite(v) && target > 0 ? clamp01(v / target) : null;

  const parts = [
    ratio(f.weeklyAscentM, ref.weeklyAscentM),
    ratio(f.biggestDayAscentM, ref.dayAscentM),
    ratio(f.longestDayHours, ref.sustainedHours),
  ].filter((n): n is number => n !== null);

  // Renormalise over what was actually answered rather than treating an
  // unanswered question as a zero.
  const mean = parts.reduce((a, b) => a + b, 0) / parts.length;
  const score = known(Math.min(SELF_REPORT_CEILING, mean * 100));

  return {
    id: "fitness",
    label,
    score,
    provenance: "self-reported",
    summary: `Based on what you told us, not on anything ICEFALL has seen. It is held below ${SELF_REPORT_CEILING} for that reason, and it is measured against ICEFALL's benchmarks for this class of objective — ${metres(ref.dayAscentM)} in a day, ${ref.sustainedHours} hours on the move, ${metres(ref.weeklyAscentM)} a week — not against the route. Record a few sessions and this becomes an observation instead of an estimate.`,
    requirements,
  };
}

function fitnessDimension(
  ev: Evidence,
  ref: TrainingReference,
  reported?: SelfReportedFitness,
): DimensionResult {
  const label = "Fitness";

  const bigDayReq: Requirement = {
    label: `A single day of ${metres(ref.dayAscentM)} ascent`,
    met: ev.biggestDayAscentM === null ? null : ev.biggestDayAscentM >= ref.dayAscentM,
    note:
      ev.biggestDayAscentM === null
        ? "No session recorded in the last twelve weeks."
        : `Your biggest recorded day in the last twelve weeks climbed ${metres(ev.biggestDayAscentM)}.`,
  };

  const sustainedReq: Requirement = {
    label: `${ref.sustainedHours} hours of sustained movement in one day`,
    met: ev.longestDayHours === null ? null : ev.longestDayHours >= ref.sustainedHours,
    note:
      ev.longestDayHours === null
        ? "No session recorded in the last twelve weeks."
        : `Your longest recorded day was ${ev.longestDayHours.toFixed(1)} hours.`,
  };

  const volumeReq: Requirement = {
    label: `${metres(ref.weeklyAscentM)} of ascent a week, held rather than spiked`,
    met: ev.weeklyAscentM === null ? null : ev.weeklyAscentM >= ref.weeklyAscentM,
    note:
      ev.weeklyAscentM === null
        ? "Not enough recorded history to average a week."
        : `You are averaging ${metres(ev.weeklyAscentM)} a week over the period ICEFALL can see.`,
  };

  const requirements = [bigDayReq, sustainedReq, volumeReq];

  if (ev.observedDays === null) {
    if (hasSelfReport(reported)) return selfReportedFitness(reported, ref);
    return {
      id: "fitness",
      label,
      score: unavailable("no-data"),
      summary:
        "Nothing is recorded in ICEFALL yet, so there is no basis for a fitness figure against this objective. Record your sessions and this fills in on its own.",
      requirements,
    };
  }

  if (ev.windowSessions < MIN_FITNESS_SESSIONS || ev.observedDays < MIN_FITNESS_HISTORY_DAYS) {
    if (hasSelfReport(reported)) return selfReportedFitness(reported, ref);
    return {
      id: "fitness",
      label,
      score: unavailable("too-little-history"),
      summary: `${ev.windowSessions} session${ev.windowSessions === 1 ? "" : "s"} across ${ev.observedDays} day${ev.observedDays === 1 ? "" : "s"} of recorded history. That is too little to describe a build, and a number off it would be an opinion about one weekend.`,
      requirements,
    };
  }

  const volume = clamp01((ev.weeklyAscentM ?? 0) / ref.weeklyAscentM);
  const bigDay = clamp01((ev.biggestDayAscentM ?? 0) / ref.dayAscentM);
  const sustained = clamp01((ev.longestDayHours ?? 0) / ref.sustainedHours);

  const score = fraction(
    FITNESS_WEIGHTS.volume * volume +
      FITNESS_WEIGHTS.bigDay * bigDay +
      FITNESS_WEIGHTS.sustained * sustained,
  );

  const parts = [
    `Measured against ICEFALL's training benchmarks for this class of objective — ${metres(ref.dayAscentM)} in a day, ${ref.sustainedHours} hours on the move, ${metres(ref.weeklyAscentM)} a week — not against the route itself, which ICEFALL does not hold.`,
    `${volumeReq.note} ${bigDayReq.note} ${sustainedReq.note}`,
  ];

  if (ev.simulatedDropped > 0) {
    parts.push(
      `${ev.simulatedDropped} simulated recording${ev.simulatedDropped === 1 ? "" : "s"} ${ev.simulatedDropped === 1 ? "was" : "were"} left out of these figures.`,
    );
  }

  return { id: "fitness", label, score, summary: parts.join(" "), requirements };
}

/* -------------------------------------------------------------------------- */
/* Dimension: technical                                                        */
/* -------------------------------------------------------------------------- */

/** Does a reported skill plausibly cover a required one? */
function skillClaimed(required: string, claims: string[]): boolean {
  const want = normalise(required);
  return claims.some((raw) => {
    const got = normalise(raw);
    if (got.length < MIN_CLAIM_CHARS) return false;
    return got === want || want.includes(got) || got.includes(want);
  });
}

/**
 * The dimension ICEFALL cannot measure and must not guess.
 *
 * There is no signal in a training feed that says an athlete can place
 * protection, move together on a ridge, arrest on hard névé or extract a
 * partner from a crevasse. Volume does not imply it, vertical does not imply
 * it, and a strong runner is not a competent alpinist. So:
 *
 *   - with a self-report, the score is the share of the objective's demands the
 *     athlete says they hold, capped well below full because a claim is a claim;
 *   - with only recorded days on mountain ground, the score is capped far lower
 *     still and no individual requirement is marked met — a picker label says
 *     where someone chose to file a session, not what they climbed;
 *   - with neither, it is null and the UI should ask.
 */
function technicalDimension(
  assessment: PeakAssessment,
  ev: Evidence,
  claims: string[] | undefined,
): DimensionResult {
  const label = "Technical";
  const applicable = assessment.band >= 3;
  const skills = assessment.skills;

  if (!applicable) {
    return {
      id: "technical",
      label,
      // No reason: the dimension does not apply, which is not the same as
      // missing. See the DimensionResult doc comment.
      score: { value: null },
      summary: `This class of objective asks for judgement rather than technical craft — ${joinList(skills.map((s) => s.toLowerCase()))}. ICEFALL does not score technical readiness below scrambling ground. Kit still matters: ${joinList(assessment.technicalKit.map((k) => k.toLowerCase()))}.`,
      requirements: skills.map((s) => ({
        label: s,
        met: null,
        note: "Not scored on this class of objective.",
      })),
    };
  }

  const reported = (claims ?? []).filter((c) => c.trim().length > 0);
  const requirements: Requirement[] = skills.map((skill) => {
    const met = reported.length > 0 && skillClaimed(skill, reported) ? true : null;
    return {
      label: skill,
      met,
      // Never `false`. Not having mentioned a competence is not evidence of
      // lacking it, and a cross beside an untouched question would be ICEFALL
      // asserting something nobody told it.
      note: met
        ? "You have reported this. Self-declared — ICEFALL cannot verify it, and a guide will form their own view."
        : "Not reported. Tell ICEFALL whether you hold this, or book instruction for it.",
    };
  });

  const kitNote = `Kit this class of ground normally demands: ${joinList(assessment.technicalKit.map((k) => k.toLowerCase()))}.`;

  if (reported.length > 0) {
    const held = requirements.filter((r) => r.met === true).length;
    const score = capped((held / skills.length) * 100, SELF_REPORT_CEILING);
    const missing = requirements.filter((r) => r.met !== true).map((r) => r.label.toLowerCase());

    return {
      id: "technical",
      label,
      score,
      summary: [
        `You have reported ${held} of the ${skills.length} competences this class of objective normally demands.`,
        missing.length > 0
          ? `Nothing has been reported for ${joinList(missing)} — learn those from a qualified instructor rather than on the objective.`
          : "Every competence on the list has been reported.",
        "This is self-declared and scored well short of full marks for that reason: ICEFALL has no way to verify skill, and none of it says how you move on the day.",
        kitNote,
      ].join(" "),
      requirements,
    };
  }

  if (ev.mountainDays >= MIN_EXPOSURE_DAYS) {
    const score = capped(
      (ev.mountainDays / EXPOSURE_FULL_DAYS) * EXPOSURE_CEILING,
      EXPOSURE_CEILING,
    );
    return {
      id: "technical",
      label,
      score,
      summary: [
        `You have recorded ${ev.mountainDays} days on mountain ground in the last two years (${joinList(ev.mountainDisciplines.map((d) => d.toLowerCase()))}).`,
        "That is exposure, not competence, and it is capped accordingly: an activity label says where you filed a session, not what ground you were on, what you led, or who was leading it.",
        `No competence is counted as held until you report it — ${joinList(skills.map((s) => s.toLowerCase()))} are all still open.`,
        kitNote,
      ].join(" "),
      requirements,
    };
  }

  return {
    id: "technical",
    label,
    score: unavailable("not-reported"),
    summary: [
      `This class of objective normally demands ${joinList(skills.map((s) => s.toLowerCase()))}.`,
      "ICEFALL has no way to see any of that from a training feed and will not infer it from how much you run or climb, so there is no score here until you tell it what you hold.",
      kitNote,
    ].join(" "),
    requirements,
  };
}

/* -------------------------------------------------------------------------- */
/* Dimension: altitude                                                         */
/* -------------------------------------------------------------------------- */

interface AltitudeEvidence {
  highestM: number | null;
  source: string | null;
}

/** The highest point we can stand behind, and where the figure came from. */
function bestAltitude(
  ev: Evidence,
  summits: { name: string; elevationM: number; date: string }[],
  reportedM: number | undefined,
): AltitudeEvidence {
  const candidates: { value: number; source: string }[] = [];

  if (ev.highestRecordedAltitudeM !== null) {
    candidates.push({
      value: ev.highestRecordedAltitudeM,
      source: "the highest point a recorded session reached",
    });
  }

  const highestSummit = summits.reduce<{ name: string; elevationM: number } | null>(
    (best, s) =>
      Number.isFinite(s.elevationM) && (best === null || s.elevationM > best.elevationM) ? s : best,
    null,
  );
  if (highestSummit !== null) {
    candidates.push({
      value: highestSummit.elevationM,
      source: `your logged summit of ${highestSummit.name}`,
    });
  }

  if (typeof reportedM === "number" && Number.isFinite(reportedM) && reportedM > 0) {
    candidates.push({ value: reportedM, source: "the highest altitude you have reported" });
  }

  if (candidates.length === 0) return { highestM: null, source: null };

  const best = candidates.reduce((a, b) => (b.value > a.value ? b : a));
  return { highestM: best.value, source: best.source };
}

/**
 * Altitude, which is a fact about where someone has been and never a prediction
 * about how they will cope.
 *
 * The score compares the highest altitude we can stand behind against the
 * objective. That is all it does. It does not model tolerance, it does not
 * assess acclimatisation, and it says nothing about altitude illness — which is
 * a medical matter, varies between people, varies between trips for the same
 * person, and is not predictable from a history.
 */
function altitudeDimension(
  peakElevationM: number,
  peakName: string,
  assessment: PeakAssessment,
  evidence: AltitudeEvidence,
): DimensionResult {
  const label = "Altitude";
  const needsAcclimatisation = assessment.acclimatisation !== undefined;

  if (peakElevationM < ALTITUDE_RELEVANT_M) {
    return {
      id: "altitude",
      label,
      score: { value: null },
      summary: `At ${metres(peakElevationM)}, altitude is not the limiting factor on this objective. ICEFALL assesses it above ${metres(ALTITUDE_RELEVANT_M)}, so there is nothing to score here rather than a full bar that would mean nothing.`,
      requirements: [],
    };
  }

  const requirements: Requirement[] = [
    {
      label: `Time at or above ${metres(peakElevationM)}`,
      met: evidence.highestM === null ? null : evidence.highestM >= peakElevationM,
      note:
        evidence.highestM === null
          ? "Nothing recorded or reported. Tell ICEFALL the highest altitude you have been to."
          : `Highest on record for you is ${metres(evidence.highestM)}, from ${evidence.source}.`,
    },
  ];

  if (needsAcclimatisation) {
    requirements.push({
      label: "A staged acclimatisation plan for this trip",
      // Permanently null, and correctly so. The itinerary is the single biggest
      // determinant of how this goes and ICEFALL cannot see it.
      met: null,
      note: `${assessment.acclimatisation} ICEFALL cannot see your itinerary, so this is not assessed here — plan it with your guide or operator.`,
    });
  }

  const framing =
    "This compares where you have been against where you are going. It is not a prediction of how you will respond to altitude: that varies between people and between trips for the same person, and altitude illness is a medical matter, not something an app can anticipate. Ascend slowly, and descend at the first sign that something is wrong.";

  if (evidence.highestM === null) {
    return {
      id: "altitude",
      label,
      score: unavailable("not-reported"),
      summary: `${peakName} stands at ${metres(peakElevationM)}. Nothing in your recorded sessions or your profile says how high you have been, and it cannot be inferred from training, so there is no score here yet. ${framing}`,
      requirements,
    };
  }

  // Measured from ALTITUDE_BASELINE_M rather than sea level: below that,
  // altitude is not what limits people, and scoring from zero would report
  // someone who has been to 3,000 m as half-ready for 6,000 m.
  const span = Math.max(1, peakElevationM - ALTITUDE_BASELINE_M);
  const progress = clamp01((evidence.highestM - ALTITUDE_BASELINE_M) / span);
  const score = needsAcclimatisation
    ? capped(progress * 100, ALTITUDE_ACCLIMATISATION_CEILING)
    : fraction(progress);

  const parts = [
    `${peakName} stands at ${metres(peakElevationM)}. The highest ICEFALL can stand behind for you is ${metres(evidence.highestM)}, from ${evidence.source}.`,
  ];

  if (needsAcclimatisation) {
    parts.push(
      "Having reached an altitude once is not the same as being acclimatised for it — acclimatisation is lost within a few weeks at low elevation — so this dimension stops short of full marks whatever your history.",
    );
    parts.push(assessment.acclimatisation as string);
  }

  parts.push(framing);

  return { id: "altitude", label, score, summary: parts.join(" "), requirements };
}

/* -------------------------------------------------------------------------- */
/* Dimension: experience                                                       */
/* -------------------------------------------------------------------------- */

/** Logged summits carry more weight when they are of comparable seriousness. */
const COMPARABLE_SUMMITS_CEILING = 3;
const SUMMIT_COUNT_CEILING = 8;

/**
 * Days out, objectives completed, and whatever the athlete has told us.
 *
 * Logged summits are the strongest signal available and are still self-entered.
 * Free-text discipline experience is surfaced verbatim and never parsed into a
 * number — "three seasons" is not a quantity, and turning it into one would
 * manufacture precision that does not exist.
 */
function experienceDimension(
  peakElevationM: number,
  assessment: PeakAssessment,
  ev: Evidence,
  summits: { name: string; elevationM: number; date: string }[],
  disciplineExperience: Record<string, string> | undefined,
): DimensionResult {
  const label = "Experience";
  const applicable = assessment.band >= 3;

  const declared = Object.entries(disciplineExperience ?? {}).filter(
    ([, value]) => value.trim().length > 0,
  );
  const declaredRequirements: Requirement[] = declared.map(([discipline, value]) => ({
    label: `${discipline} experience`,
    met: null,
    note: `You reported: ${value}. Self-declared, and recorded here as context rather than scored.`,
  }));

  if (!applicable) {
    return {
      id: "experience",
      label,
      score: { value: null },
      summary:
        "ICEFALL does not score prior mountaineering experience for this class of objective. Ordinary hill judgement and a forecast are what it asks for.",
      requirements: declaredRequirements,
    };
  }

  const objectiveBand = assessment.band;
  const comparable = summits.filter(
    (s) => Number.isFinite(s.elevationM) && bandForElevation(s.elevationM) >= objectiveBand - 1,
  );
  const highest = summits.reduce(
    (m, s) => (Number.isFinite(s.elevationM) && s.elevationM > m ? s.elevationM : m),
    0,
  );

  const requirements: Requirement[] = [
    {
      label: `An objective of comparable seriousness (${assessment.shortLabel.toLowerCase()})`,
      met: summits.length === 0 ? null : comparable.length > 0,
      note:
        summits.length === 0
          ? "No summits logged. Add the objectives you have done and this becomes specific."
          : `${comparable.length} of your ${summits.length} logged summit${summits.length === 1 ? "" : "s"} ${comparable.length === 1 ? "is" : "are"} in the same class or one below.`,
    },
    {
      label: "A record of days out to draw on",
      // Days on mountain ground count towards this one even without a summit
      // log — they are a weaker signal, not an absent one. They do NOT count
      // towards the requirement above, which is about the class of objective.
      met:
        summits.length === 0 && ev.mountainDays === 0
          ? null
          : summits.length >= 3 || ev.mountainDays >= EXPOSURE_FULL_DAYS,
      note:
        summits.length > 0
          ? `${summits.length} summit${summits.length === 1 ? "" : "s"} logged, highest ${metres(highest)}.`
          : `No summits logged; ${ev.mountainDays} day${ev.mountainDays === 1 ? "" : "s"} on mountain ground recorded in the last two years.`,
    },
    ...declaredRequirements,
  ];

  if (summits.length > 0) {
    const breadth = clamp01(summits.length / SUMMIT_COUNT_CEILING);
    const depth = clamp01(comparable.length / COMPARABLE_SUMMITS_CEILING);
    // Depth carries the same weight as breadth on purpose: ten hill days do not
    // add up to one alpine route, and a score that let them would be the
    // arithmetic version of bad advice.
    const score = fraction(0.5 * breadth + 0.5 * depth);

    return {
      id: "experience",
      label,
      score,
      summary: [
        `${summits.length} summit${summits.length === 1 ? "" : "s"} logged, highest ${metres(highest)}, of which ${comparable.length} ${comparable.length === 1 ? "is" : "are"} of comparable seriousness to ${assessment.label.toLowerCase()}.`,
        comparable.length === 0
          ? `Nothing you have logged is in this class, so ${assessment.label.toLowerCase()} would be a step up rather than a repeat — build towards it through objectives of the class below.`
          : "Objectives of this class are on your record.",
        declared.length > 0
          ? `You have also reported experience in ${joinList(declared.map(([d]) => d.toLowerCase()))}, held here as context rather than scored.`
          : "",
        "Logged summits are your own entries. ICEFALL does not verify them and neither does the number above.",
      ]
        .filter(Boolean)
        .join(" "),
      requirements,
    };
  }

  if (ev.mountainDays >= MIN_EXPOSURE_DAYS) {
    const score = capped(
      (ev.mountainDays / EXPOSURE_FULL_DAYS) * EXPOSURE_CEILING,
      EXPOSURE_CEILING,
    );
    return {
      id: "experience",
      label,
      score,
      summary: [
        `No summits logged, but ${ev.mountainDays} days on mountain ground are recorded in the last two years (${joinList(ev.mountainDisciplines.map((d) => d.toLowerCase()))}).`,
        `Days out are not completed objectives, so this is capped low: it says you have been on the hill, not that you have done anything resembling ${assessment.label.toLowerCase()} at ${metres(peakElevationM)}.`,
        "Log the summits you have done and this becomes a far better answer.",
      ].join(" "),
      requirements,
    };
  }

  return {
    id: "experience",
    label,
    score: unavailable("not-reported"),
    summary: [
      `Nothing on your record says what you have climbed. ${assessment.label} objectives are built on a history of smaller ones, and that history is something you have to tell ICEFALL — it cannot be read out of a training feed.`,
      declared.length > 0
        ? `You have reported experience in ${joinList(declared.map(([d]) => d.toLowerCase()))}, which is held as context but is not enough to score against a specific objective.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
    requirements,
  };
}

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Order of consequence, and the order gaps are reported in. On a mountain,
 * missing competence and missing altitude history hurt you faster and harder
 * than a slow ascent time, so they are named first whatever the arithmetic.
 */
const SEVERITY_ORDER: Dimension[] = ["technical", "altitude", "experience", "fitness"];

/** Which reason to show when the composite is withheld. Most actionable first. */
const REASON_PRIORITY: Unavailable[] = [
  "not-reported",
  "too-little-history",
  "needs-permission",
  "not-connected",
  "no-data",
];

function dominantReason(dimensions: DimensionResult[]): Unavailable {
  const reasons = dimensions
    .map((d) => d.score.reason)
    .filter((r): r is Unavailable => r !== undefined);
  for (const candidate of REASON_PRIORITY) {
    if (reasons.includes(candidate)) return candidate;
  }
  return "not-reported";
}

/** What to do about the dimension that is holding the objective back. */
function recommendationFor(
  dimension: DimensionResult,
  assessment: PeakAssessment,
  unknownBlocking: boolean,
): string {
  const preface = unknownBlocking
    ? `ICEFALL is not putting a single figure on this objective while ${dimension.label.toLowerCase()} is unknown: a number built from the parts that happen to be known would read as a verdict on the whole mountain. `
    : "";

  switch (dimension.id) {
    case "technical":
      return `${preface}${
        dimension.score.value === null
          ? `Tell ICEFALL which of these you have been trained in — ${joinList(assessment.skills.map((s) => s.toLowerCase()))} — and book instruction for the rest with an IFMGA/UIAGM-certified guide or a qualified instructor before you commit to a date.`
          : `Close this with instruction rather than mileage. ${joinList(assessment.skills.map((s) => s.toLowerCase()))} are learned in person from a certified guide or instructor, and no amount of training volume substitutes for them.`
      }`;

    case "altitude":
      return `${preface}${
        dimension.score.value === null
          ? "Add the highest altitude you have been to, and record your mountain days so the figure keeps itself current. Without it there is nothing honest to say about a high objective."
          : "Build towards this through progressively higher objectives with time spent sleeping high, and plan the acclimatisation for the trip itself with your guide or operator. Ascend slowly and descend at the first sign that something is wrong — that decision is medical, not athletic."
      }`;

    case "experience":
      return `${preface}${
        dimension.score.value === null
          ? "Log the objectives you have already done. Experience is the dimension ICEFALL is least able to infer and the one a guide will ask about first."
          : `Build the record through objectives one class below ${assessment.label.toLowerCase()}, ideally with someone more experienced or with an instructor. There is no shortcut through this dimension and no benefit to skipping a step.`
      }`;

    case "fitness":
      return `${preface}${
        dimension.score.value === null
          ? "Record your sessions for a few weeks — vertical, hours and how regularly you get out — and this dimension answers itself."
          : "Close this over months rather than weeks: one long day a week with sustained ascent, volume raised gradually, and a genuine rest day in every week. Nothing about a mountain rewards arriving tired, and a shortfall here is a reason to move the date rather than to train through it."
      }`;
  }
}

/** Non-null whenever the class of objective needs professional support. */
function professionalAdviceFor(
  assessment: PeakAssessment,
  technical: DimensionResult,
): string | null {
  if (assessment.requiresGuide) {
    const base = `${assessment.label} ground is not a place to learn on the objective. Unless you already hold ${joinList(assessment.skills.map((s) => s.toLowerCase()))} — and are climbing with a partner who holds them too — engage an IFMGA/UIAGM-certified guide, and take instruction in the skills you are missing beforehand.`;

    if (assessment.band >= 7) {
      return `${base} At this altitude the objective is undertaken with an established expedition operator, over weeks, with supplementary oxygen and fixed lines. Their assessment of you and your assessment of them matter more than anything on this screen.`;
    }
    if (assessment.band >= 6) {
      return `${base} Above 5,500 m the acclimatisation schedule and the operator you go with shape the outcome more than your training does, and both sit outside what ICEFALL can see.`;
    }
    return `${base} A guide's in-person judgement outranks every figure here.`;
  }

  // Band 3 is where hands come out of pockets. Not guide-mandatory, but not a
  // place to work it out alone either.
  if (assessment.band === 3 && (technical.score.value === null || technical.score.value < 50)) {
    return "Scrambling ground is where unroped falls happen. A day with a qualified instructor covering movement on steep ground, rope work for a short section and rockfall awareness is worth more than another month of training.";
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export function assessObjectiveReadiness(args: {
  peak: { name: string; elevationM: number; lat?: number; lon?: number };
  activities: RecordedActivity[];
  summitsLogged?: { name: string; elevationM: number; date: string }[];
  selfReported?: {
    technicalSkills?: string[];
    maxAltitudeM?: number;
    disciplineExperience?: Record<string, string>;
    /**
     * What the athlete says they are currently doing, from the readiness test.
     * Used ONLY when nothing is recorded, and the result is always flagged
     * `provenance: "self-reported"` so it can never pass as observed.
     */
    fitness?: {
      weeklyAscentM?: number;
      biggestDayAscentM?: number;
      longestDayHours?: number;
    };
  };
  /** Injectable for tests. Defaults to now. */
  now?: Date;
}): ObjectiveReadiness {
  const now = args.now ?? new Date();
  const { peak } = args;

  // Only the elevation-derived fields of the assessment are read here — band,
  // skills, technical kit, guide requirement and acclimatisation. Latitude
  // shapes the season window alone, which this module does not surface, so an
  // unknown latitude changes nothing about what follows.
  const assessment = assessPeak(peak.elevationM, peak.lat ?? 0, peak.lon);
  const reference = TRAINING_REFERENCE[assessment.band];

  const summits = (args.summitsLogged ?? []).filter((s) => Number.isFinite(s.elevationM));
  const evidence = readEvidence(args.activities, now);
  const altitude = bestAltitude(evidence, summits, args.selfReported?.maxAltitudeM);

  const fitness = fitnessDimension(evidence, reference, args.selfReported?.fitness);
  const technical = technicalDimension(assessment, evidence, args.selfReported?.technicalSkills);
  const altitudeResult = altitudeDimension(peak.elevationM, peak.name, assessment, altitude);
  const experience = experienceDimension(
    peak.elevationM,
    assessment,
    evidence,
    summits,
    args.selfReported?.disciplineExperience,
  );

  const dimensions: DimensionResult[] = [fitness, technical, altitudeResult, experience];

  /* ---- Which dimensions this objective actually depends on ---------------- */

  // A dimension is applicable when the objective genuinely turns on it. The
  // non-applicable ones carry a null score with no reason (see DimensionResult)
  // and take no part in the composite — a full bar for "altitude" on a hill
  // walk would be a number pretending to be a finding.
  const applicable = dimensions.filter((d) => {
    if (d.id === "fitness") return true;
    if (d.id === "technical" || d.id === "experience") return assessment.band >= 3;
    return peak.elevationM >= ALTITUDE_RELEVANT_M;
  });

  const unknown = applicable.filter((d) => d.score.value === null);

  /* ---- Overall ------------------------------------------------------------ */

  let overall: Score;
  if (unknown.length > 0) {
    // Withheld, not averaged. This is the rule the module exists for: with a
    // dimension missing you cannot know which one is weakest, and on anything
    // serious the missing one is usually the one that matters.
    overall = unavailable(dominantReason(unknown));
  } else {
    // Weakest link. A mean would let exceptional fitness pay for absent skill,
    // which is precisely the trade a mountain does not offer.
    const weakest = Math.min(...applicable.map((d) => d.score.value as number));
    const ceiling =
      assessment.band >= 6
        ? OVERALL_HIGH_ALTITUDE_CEILING
        : assessment.requiresGuide
          ? OVERALL_GUIDED_CEILING
          : 100;
    overall = capped(weakest, ceiling);
  }

  /* ---- Biggest gap -------------------------------------------------------- */

  // Unknowns first, in order of consequence, so the withheld composite is always
  // explained by the dimension that withheld it. Then the lowest known score.
  let gapDimension: DimensionResult | null = null;
  if (unknown.length > 0) {
    gapDimension =
      SEVERITY_ORDER.map((id) => unknown.find((d) => d.id === id)).find(
        (d): d is DimensionResult => d !== undefined,
      ) ?? unknown[0];
  } else {
    const lowest = applicable.reduce((worst, d) =>
      (d.score.value as number) < (worst.score.value as number) ? d : worst,
    );
    if ((lowest.score.value as number) < STRONG_DIMENSION) gapDimension = lowest;
  }

  const biggestGap = gapDimension
    ? {
        id: gapDimension.id,
        label: gapDimension.label,
        recommendation: recommendationFor(gapDimension, assessment, unknown.length > 0),
      }
    : null;

  return {
    overall,
    dimensions,
    biggestGap,
    professionalAdvice: professionalAdviceFor(assessment, technical),
    disclaimer: OBJECTIVE_READINESS_DISCLAIMER,
  };
}
