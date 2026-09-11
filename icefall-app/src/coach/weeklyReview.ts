import type { VitalReport } from "@/coach/recovery";
import type { CoachAction } from "@/coach/tools";
import type { CheckIn } from "@/coach/types";
import { readableDay, type PlanAdjustment } from "@/tracking/adjustments";
import type { TrainingDay, TrainingPlan, TrainingWeek } from "@/types";

/**
 * THE WEEKLY REVIEW — WHAT THE WEEK ASKED FOR, WHAT IT ACTUALLY CONTAINED, AND
 * THE FEW CHANGES THAT FOLLOW FROM THE DIFFERENCE.
 *
 * ============================================================================
 * WHAT "AUTOMATICALLY" CAN HONESTLY MEAN IN A WEB APP TODAY
 * ============================================================================
 *
 * The roadmap asks for a review that "runs automatically", and for a push
 * notification on the back of it. ICEFALL is a PWA with no native wrapper and
 * no Apple push certificates, so there is no mechanism in this codebase by
 * which anything can reach somebody on a Sunday evening. Nothing here pretends
 * otherwise, and nothing on the screen implies a message was sent.
 *
 * What a PWA CAN do, and what this is: THE REVIEW IS COMPUTED THE MOMENT THE
 * ATHLETE NEXT OPENS THE APP, out of a week that has already finished, and it
 * is waiting for them when they arrive. That is genuinely automatic — nobody
 * asks for it and it exists before they tap anything — and the screen describes
 * exactly that: when it was computed, and that ICEFALL cannot reach a closed
 * app.
 *
 * `docs/weekly-review-notifications.md` is the list of what would have to exist
 * for the Sunday-evening version. It is the owner's to act on, it is
 * deliberately specific, and none of it is simulated here in the meantime.
 *
 * ============================================================================
 * PURE. NO CLOCK, NO STORE, NO REACT.
 * ============================================================================
 *
 * Everything below is a function of its arguments. `today` and `computedAt` are
 * passed in for the same reason `planGuard` takes `today`: a review that read a
 * clock could not be tested against a fixed week, and one that read a store
 * could not be reasoned about at all. The React binding, and the small "has
 * this one been seen" store, live in `coach/weeklyReviewStore.ts`.
 *
 * ============================================================================
 * RULE 1 — THE REVIEW PROPOSES ACTIONS; IT DOES NOT WRITE PLANS
 * ============================================================================
 *
 * `proposals` is a list of `CoachAction`s — the same closed vocabulary the
 * model is given, the same shapes `coach/tools.ts` defines, handed to the same
 * `previewAction` / `commitProposal` path with the same guardrails: the
 * downgraded-day refusal, the completed-day refusal, the past-day refusal, the
 * confirmation threshold, and Phase 3's re-evaluation at the moment of the tap.
 *
 * THERE IS NO SECOND ROUTE INTO THE PLAN. This module cannot write an
 * adjustment. It does not import `addAdjustments`, it never builds a
 * `NewAdjustment`, and there is no field in a `CoachAction` where a session, a
 * distance or an ascent could be put. It chooses an action and a day, exactly
 * as the model does, and the engines downstream compute every figure the
 * athlete then reads.
 *
 * ============================================================================
 * NOTHING APPLIES SILENTLY — AND THIS GOES FURTHER THAN THE THRESHOLD
 * ============================================================================
 *
 * `planActions.ts` has a measured threshold for when one change needs a tap:
 * more than one record, more than a week out, or more than a quarter of the
 * week's prescribed minutes. That threshold answers a question about A CHANGE
 * THE ATHLETE JUST ASKED FOR IN A CONVERSATION — they typed a sentence, the
 * coach acted on it, and a small immediate action does not need a second
 * confirmation of something they said ten seconds ago.
 *
 * A REVIEW IS NOT THAT. Nobody asked for it. It arrives unannounced, on a
 * morning somebody opened the app for another reason, carrying changes to a
 * week they have not thought about since Sunday. So the review screen NEVER
 * auto-commits, whatever `previewAction` returns. The threshold still decides
 * and its note is still shown, because it is the thing that explains WHY a
 * particular change is worth stopping for; the review simply declines to use
 * the arm of the API that applies without a tap.
 *
 * That is a restriction, not a bypass. Nothing here weakens a guard.
 *
 * ============================================================================
 * RULE 5 — MEASURED, RECORDED, TICKED AND REPORTED ARE FOUR DIFFERENT THINGS
 * ============================================================================
 *
 * The most tempting lie in a weekly review is "you completed 4 of 6 sessions",
 * said in one voice, when two of those four are a recorded activity that met
 * the session and two are a tick the athlete put on a day. So every day carries
 * `evidence`:
 *
 *   "recorded" — an activity satisfied the prescribed session. The app's own
 *                `activitySatisfies` decided it, upstream, not this module.
 *   "ticked"   — marked done with nothing recorded. The athlete's word for it,
 *                and the review says so in those terms.
 *   "none"     — neither.
 *
 * The counts keep them apart: `completedRecorded` and `completedTicked` are
 * separate numbers and are never summed into a headline without the split
 * printed beside it.
 *
 * AN ABSENCE OF RECORDINGS IS NOT AN ABSENCE OF TRAINING. `coach/reviews.ts`
 * already holds that rule for its descriptive review, and it matters more here
 * because this review proposes CHANGES. A week with no recording may be a week
 * of unrecorded training, and easing somebody's plan on that basis would be
 * acting on the app's blindness as though it were evidence. So the volume
 * proposal below fires ONLY when at least one activity was recorded in the
 * week — when the athlete is demonstrably recording, and a shortfall is
 * therefore a real shortfall rather than a gap in what this app can see.
 *
 * VITALS ARE REPORTED AND NOT ACTED ON, AND THE REASON IS A FACT ABOUT THE
 * STORAGE RATHER THAN A CAUTION. `tracking/sources/vitals.ts` resolves the MOST
 * RECENT reading from each instrument; ICEFALL keeps no history of nights. At
 * most one of the week's seven nights can ever appear here, and one night is
 * not a week. So the review shows the reading with its instrument and the night
 * it belongs to, says out loud how much of the week that covers, and draws
 * nothing from it. When a night history exists, this is where it earns a
 * finding — and not before.
 *
 * ============================================================================
 * WHERE IT HAS TOO LITTLE TO SAY, IT SAYS SO
 * ============================================================================
 *
 * Four states before "ready", because they are four different situations and a
 * single "not enough data" line would misdescribe three of them: no objective
 * at all, no week of the plan finished yet, a week that prescribed nothing, and
 * a week with nothing in it at all. None of them manufactures an insight, and
 * the last one is careful to say that a blank week is a blank RECORD.
 */

/* -------------------------------------------------------------------------- */
/* Tuning — every constant is a sentence about training, not a taste           */
/* -------------------------------------------------------------------------- */

/**
 * How many finished weeks a pattern is looked for across, and how many of them
 * have to agree before it is one: TWO OF THREE.
 *
 * `coach/reviews.ts` already fixed the floor for this app — fewer than two
 * observations is not a pattern, it is an anecdote. Three weeks is the shortest
 * window in which two can be a majority rather than a coincidence, and a longer
 * one would let a habit somebody has already dropped keep proposing changes to
 * their plan months later.
 */
const PATTERN_WEEKS = 3;
const PATTERN_MIN = 2;

/**
 * How far short of the week's prescribed minutes counts as a week that mostly
 * did not happen: HALF.
 *
 * Deliberately far below `activitySatisfies`'s 60%. That number answers "did
 * this session count", one day at a time, and is generous on purpose. This one
 * answers a much larger question — is the coming week a step up from where this
 * person actually is? A week at 55% of plan is a week that happened
 * imperfectly. A week under half is a week that mostly did not.
 */
const RETURN_SHORTFALL = 0.5;

/**
 * The most changes one review may propose: TWO.
 *
 * A review that proposes six changes is not a review, it is a rewrite, and
 * nobody can meaningfully consent to six before-and-afters in one sitting. Two
 * is the number at which each proposal still has its own stated basis on the
 * screen and can be taken or refused on its own.
 */
const MAX_PROPOSALS = 2;

const DAY_MS = 86_400_000;

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The minimum an activity has to be for this module.
 *
 * A narrow shape rather than `Activity` or `RecordedActivity`, so the review can
 * be tested against four literals and so it is obvious at a glance that nothing
 * here reads a track, a heart rate or anything about the body.
 */
export interface ReviewActivity {
  id: string;
  title: string;
  /** ISO instant. The local date is derived through the caller's `localDate`. */
  startedAt: string;
  durationSec: number;
  distanceKm: number;
  elevationGainM: number;
}

export interface WeeklyReviewInput {
  /** Local calendar date, the same string the plan keys days on. */
  today: string;
  /** When this was computed. Shown, because a review is a thing with an age. */
  computedAt: string;
  plan: TrainingPlan | null;
  objective: { name: string; targetDate: string } | null;
  /**
   * The app's own answer to "was this day done", exactly as `useTraining`
   * computes it. Passed in rather than recomputed, so the review and the plan
   * screen cannot disagree about a tick.
   */
  completedByDate: ReadonlyMap<string, boolean>;
  /** Dates where an activity satisfied the prescribed session. Also `useTraining`'s. */
  satisfiedByActivity: ReadonlySet<string>;
  /** Non-simulated activities. The caller filters; this module never invents one. */
  activities: readonly ReviewActivity[];
  /** Every live adjustment for this goal — undone ones already filtered out. */
  adjustments: readonly PlanAdjustment[];
  checkIns: readonly CheckIn[];
  /** The resolved measured vitals, exactly as `assessRecovery` reported them. */
  vitals: readonly VitalReport[];
  /** Derives a local `YYYY-MM-DD` from an ISO instant. The caller's `isoDate`. */
  localDate: (iso: string) => string;
}

/* -------------------------------------------------------------------------- */
/* Output                                                                      */
/* -------------------------------------------------------------------------- */

export type WeeklyReviewState =
  /** No active objective, so there is no plan for a week to be measured against. */
  | "no-objective"
  /** The plan exists but no week of it has finished yet. */
  | "no-finished-week"
  /** The reviewed week prescribed no sessions at all. */
  | "week-prescribed-nothing"
  /** The reviewed week holds nothing: no recording, no check-in, no completion. */
  | "week-empty"
  | "ready";

export type DayEvidence = "recorded" | "ticked" | "none";

export interface ReviewDay {
  /** The day as the plan holds it, adjustments already applied. */
  day: TrainingDay;
  /** "Sat 20 Sep" — the adjustment layer's pinned formatter. */
  label: string;
  done: boolean;
  evidence: DayEvidence;
  /** What was actually recorded on this date. Empty when nothing was. */
  activities: ReviewActivity[];
  /** Changes made to this day, whenever they were made. */
  changes: PlanAdjustment[];
}

export interface ReviewWindow {
  weekIndex: number;
  block: string;
  start: string;
  end: string;
  /** "the week of 8 September". */
  label: string;
}

export interface ReviewCounts {
  /** Days the plan asked for work on. A rest day is not a session. */
  prescribed: number;
  /** Completed with a recording that met the session. */
  completedRecorded: number;
  /** Completed on the athlete's word alone. Never silently summed with the above. */
  completedTicked: number;
  missed: number;
  /** `long-mountain` days the week held, and how many were not completed. */
  longPrescribed: number;
  longMissed: number;
  /** The week's prescribed minutes, and the minutes actually recorded in it. */
  plannedMinutes: number;
  recordedMinutes: number;
  plannedAscentM: number;
  recordedAscentM: number;
  activityCount: number;
  /** Check-ins filed on the week's own days. */
  checkInCount: number;
  /** Adjustment records landing on one of the week's days. */
  changeCount: number;
}

/**
 * One thing the review has to say: the app's sentence, built from the engine's
 * numbers.
 *
 * `figures` lists the numbers the sentence was assembled from so the screen can
 * show them beside it. Same discipline as `planActions.summarise` — the prose
 * is the app's, the numbers are the engine's, and there is no third place a
 * figure could have come from.
 */
export interface ReviewFinding {
  id: string;
  text: string;
  figures: string[];
  /** What kind of evidence the sentence rests on, for the badge beside it. */
  kind: "recorded" | "ticked" | "self-reported" | "measured" | "plan";
}

export interface ReviewProposal {
  id: string;
  /** Handed straight to `previewAction`. Nothing here writes a record. */
  action: CoachAction;
  /** What this is for, in the app's words. Shown above the before/after. */
  rationale: string;
  /** The measurements that triggered it, each checkable on another screen. */
  basis: string[];
}

export interface ReviewVitals {
  /** Readings whose measured night falls inside the reviewed week. */
  inWindow: VitalReport[];
  /** Readings ICEFALL holds that belong to some other night, or to no stated night. */
  outside: VitalReport[];
  /** How much of the week these cover, said plainly. Always present. */
  coverage: string;
}

export interface ReviewCheckIns {
  count: number;
  /** The days they filed on, earliest first. */
  dates: string[];
  /** The lowest energy reported, and the day. A fact about one morning, not an average. */
  lowest: { date: string; energy: number } | null;
}

export interface ReviewObjective {
  name: string;
  targetDate: string;
  daysAway: number;
  /** `long-mountain` days still ahead in the plan before the date. */
  longDaysRemaining: number;
}

export interface WeeklyReview {
  state: WeeklyReviewState;
  /** The sentence shown instead of a review. Empty exactly when state is "ready". */
  note: string;
  computedAt: string;
  window: ReviewWindow | null;
  days: ReviewDay[];
  counts: ReviewCounts;
  findings: ReviewFinding[];
  proposals: ReviewProposal[];
  checkIns: ReviewCheckIns;
  vitals: ReviewVitals;
  objective: ReviewObjective | null;
  /** True when there is a review and it has nothing to propose. Not "sparse". */
  allClear: boolean;
}

/* -------------------------------------------------------------------------- */
/* Dates — all of it from the date STRING, so no locale can move a day         */
/* -------------------------------------------------------------------------- */

function daysBetween(from: string, to: string): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/** "8 September" — pinned locale, for the reason `readableDay` is pinned. */
const monthDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

function readableMonthDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return monthDay.format(new Date(Date.UTC(y, m - 1, d)));
}

/** 0 = Monday … 6 = Sunday. */
function weekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

const WEEKDAY_NAME = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function sentence(s: string): string {
  return s.length === 0 ? s : `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* -------------------------------------------------------------------------- */
/* Finding the week to review                                                  */
/* -------------------------------------------------------------------------- */

function lastDateOf(week: TrainingWeek): string {
  return week.days.reduce((acc, d) => (d.date > acc ? d.date : acc), week.days[0]?.date ?? "");
}

/**
 * Every plan week that has ENTIRELY finished, earliest first.
 *
 * Entirely. A week whose last day is today is not reviewable: the athlete may
 * be about to go out, and a review that counted today as missed would be wrong
 * for several hours and then quietly become right, which is worse than waiting
 * a day.
 */
export function finishedWeeks(plan: TrainingPlan | null, today: string): TrainingWeek[] {
  if (!plan) return [];
  return plan.weeks
    .filter((w) => w.days.length > 0 && lastDateOf(w) < today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** The week a review is about: the most recent one that has finished. */
export function reviewableWeek(plan: TrainingPlan | null, today: string): TrainingWeek | null {
  const finished = finishedWeeks(plan, today);
  return finished.length > 0 ? finished[finished.length - 1] : null;
}

/** The plan week immediately after `week` — the one a proposal is allowed to touch. */
function weekAfter(plan: TrainingPlan, week: TrainingWeek): TrainingWeek | null {
  return plan.weeks.find((w) => w.index === week.index + 1) ?? null;
}

/* -------------------------------------------------------------------------- */
/* The empty answer, so every early return has one shape                       */
/* -------------------------------------------------------------------------- */

const NO_COUNTS: ReviewCounts = {
  prescribed: 0,
  completedRecorded: 0,
  completedTicked: 0,
  missed: 0,
  longPrescribed: 0,
  longMissed: 0,
  plannedMinutes: 0,
  recordedMinutes: 0,
  plannedAscentM: 0,
  recordedAscentM: 0,
  activityCount: 0,
  checkInCount: 0,
  changeCount: 0,
};

function empty(
  state: WeeklyReviewState,
  note: string,
  computedAt: string,
  window: ReviewWindow | null = null,
): WeeklyReview {
  return {
    state,
    note,
    computedAt,
    window,
    days: [],
    counts: NO_COUNTS,
    findings: [],
    proposals: [],
    checkIns: { count: 0, dates: [], lowest: null },
    vitals: { inWindow: [], outside: [], coverage: "" },
    objective: null,
    allClear: false,
  };
}

/* -------------------------------------------------------------------------- */
/* The review                                                                  */
/* -------------------------------------------------------------------------- */

export function buildWeeklyReview(input: WeeklyReviewInput): WeeklyReview {
  const { today, computedAt, plan, objective, localDate } = input;

  if (!plan || !objective) {
    return empty(
      "no-objective",
      "You have no active objective, so there is no plan for a week to be reviewed against.",
      computedAt,
    );
  }

  const week = reviewableWeek(plan, today);
  if (!week) {
    return empty(
      "no-finished-week",
      "Your plan's first week has not finished yet. ICEFALL reviews a week once it is over, so there is nothing to look back on.",
      computedAt,
    );
  }

  const start = week.startDate;
  const end = lastDateOf(week);
  const window: ReviewWindow = {
    weekIndex: week.index,
    block: week.block,
    start,
    end,
    label: `the week of ${readableMonthDay(start)}`,
  };
  const inWindow = (date: string) => date >= start && date <= end;

  /* ---- Activities by local date, once ------------------------------------ */

  const byDate = new Map<string, ReviewActivity[]>();
  for (const a of input.activities) {
    const key = localDate(a.startedAt);
    byDate.set(key, [...(byDate.get(key) ?? []), a]);
  }

  const weekActivities = input.activities.filter((a) => inWindow(localDate(a.startedAt)));
  const weekCheckIns = [...input.checkIns]
    .filter((c) => inWindow(c.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  /* ---- The days ---------------------------------------------------------- */

  const changesByDate = new Map<string, PlanAdjustment[]>();
  for (const a of input.adjustments) {
    changesByDate.set(a.date, [...(changesByDate.get(a.date) ?? []), a]);
  }

  const days: ReviewDay[] = week.days.map((day) => {
    const done = input.completedByDate.get(day.date) === true;
    const satisfied = input.satisfiedByActivity.has(day.date);
    return {
      day,
      label: readableDay(day.date),
      done,
      /* A tick and a recording are not the same evidence and are not merged.
         `satisfiedByActivity` is the app's own answer, computed once in
         `useTraining`, so this cannot become a second opinion about the same
         day. */
      evidence: satisfied ? "recorded" : done ? "ticked" : "none",
      activities: byDate.get(day.date) ?? [],
      changes: changesByDate.get(day.date) ?? [],
    };
  });

  const sessions = days.filter((d) => d.day.focus !== "rest");
  const longDays = sessions.filter((d) => d.day.focus === "long-mountain");

  if (sessions.length === 0) {
    return empty(
      "week-prescribed-nothing",
      `${sentence(window.label)} was a rest week in your plan — it asked for no sessions, so there is nothing to compare. What you did record is on Progress.`,
      computedAt,
      window,
    );
  }

  /* ---- A week with nothing in it at all ---------------------------------- */

  /**
   * NOT "A WEEK OF ZEROES". The distinction is the whole point and it is the
   * one `coach/reviews.ts` already makes: an empty record is an empty RECORD.
   * It cannot be told apart from a fortnight away, a week of training nobody
   * logged, or a phone that was off — so the review declines to describe it,
   * and says which of those it cannot tell apart rather than picking one.
   */
  if (weekActivities.length === 0 && weekCheckIns.length === 0 && days.every((d) => !d.done)) {
    const latest = input.activities.reduce<string | null>((acc, a) => {
      const d = localDate(a.startedAt);
      return acc === null || d > acc ? d : acc;
    }, null);
    return empty(
      "week-empty",
      latest === null
        ? `ICEFALL holds nothing at all for ${window.label}: no recorded activity, no check-in, nothing ticked. An empty record is not a week without training — it is a week this app cannot see, and it will not describe one.`
        : `ICEFALL holds nothing for ${window.label}: no recorded activity, no check-in, nothing ticked. Your most recent recording is ${readableDay(latest)}, ${plural(daysBetween(latest, today), "day")} ago. An empty record is not a week without training, so there is nothing here to review and nothing to change your plan on.`,
      computedAt,
      window,
    );
  }

  /* ---- Counts ------------------------------------------------------------ */

  const counts: ReviewCounts = {
    prescribed: sessions.length,
    completedRecorded: sessions.filter((d) => d.evidence === "recorded").length,
    completedTicked: sessions.filter((d) => d.evidence === "ticked").length,
    missed: sessions.filter((d) => !d.done).length,
    longPrescribed: longDays.length,
    longMissed: longDays.filter((d) => !d.done).length,
    plannedMinutes: Math.round(sessions.reduce((n, d) => n + (d.day.durationMin ?? 0), 0)),
    recordedMinutes: Math.round(weekActivities.reduce((n, a) => n + a.durationSec / 60, 0)),
    plannedAscentM: Math.round(sessions.reduce((n, d) => n + (d.day.elevationM ?? 0), 0)),
    recordedAscentM: Math.round(weekActivities.reduce((n, a) => n + a.elevationGainM, 0)),
    activityCount: weekActivities.length,
    checkInCount: weekCheckIns.length,
    changeCount: input.adjustments.filter((a) => inWindow(a.date)).length,
  };

  /* ---- Check-ins: facts, never an average -------------------------------- */

  const checkIns: ReviewCheckIns = {
    count: weekCheckIns.length,
    dates: weekCheckIns.map((c) => c.date),
    lowest: weekCheckIns.reduce<{ date: string; energy: number } | null>(
      (acc, c) => (acc === null || c.energy < acc.energy ? { date: c.date, energy: c.energy } : acc),
      null,
    ),
  };

  /* ---- Vitals: shown, dated, and explicitly not a week -------------------- */

  const withReading = input.vitals.filter((v) => v.value !== null);
  const vitals: ReviewVitals = {
    inWindow: withReading.filter((v) => v.measuredOn !== undefined && inWindow(v.measuredOn)),
    outside: withReading.filter((v) => v.measuredOn === undefined || !inWindow(v.measuredOn)),
    /* SAID EVERY TIME, INCLUDING WHEN A READING IS PRESENT. The temptation is
       to print "6 h 12" under a weekly heading and let the reader supply "…on
       average, that week". ICEFALL holds one night, so it says one night. */
    coverage:
      "ICEFALL keeps the most recent reading from each instrument, not a history of nights — so at most one of this week's nights can appear here, and nothing in this review is calculated from it.",
  };

  /* ---- The objective ----------------------------------------------------- */

  const target = objective.targetDate.slice(0, 10);
  const objectiveOut: ReviewObjective = {
    name: objective.name,
    targetDate: target,
    daysAway: daysBetween(today, target),
    longDaysRemaining: plan.weeks
      .flatMap((w) => w.days)
      .filter((d) => d.focus === "long-mountain" && d.date > today && d.date <= target).length,
  };

  const findings = buildFindings({ window, counts, sessions, longDays, objective: objectiveOut, checkIns });

  const proposals = buildProposals({
    plan,
    week,
    window,
    counts,
    byDate,
    completedByDate: input.completedByDate,
    objective: objectiveOut,
    adjustments: input.adjustments,
    today,
  });

  return {
    state: "ready",
    note: "",
    computedAt,
    window,
    days,
    counts,
    findings,
    proposals,
    checkIns,
    vitals,
    objective: objectiveOut,
    allClear: proposals.length === 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Findings — the app's sentences, the engine's numbers                        */
/* -------------------------------------------------------------------------- */

function buildFindings(args: {
  window: ReviewWindow;
  counts: ReviewCounts;
  sessions: ReviewDay[];
  longDays: ReviewDay[];
  objective: ReviewObjective;
  checkIns: ReviewCheckIns;
}): ReviewFinding[] {
  const { window, counts, sessions, longDays, objective, checkIns } = args;
  const out: ReviewFinding[] = [];
  const completed = counts.completedRecorded + counts.completedTicked;

  /* 1 — WHAT WAS ASKED AND WHAT CAME BACK, WITH THE EVIDENCE SPLIT INTACT. */
  out.push({
    id: "completion",
    kind: counts.completedTicked > 0 ? "ticked" : "recorded",
    text:
      counts.completedTicked > 0
        ? `${sentence(window.label)} asked for ${plural(counts.prescribed, "session")}. ${completed} came back done — ${counts.completedRecorded} with a recorded activity that met the session, and ${counts.completedTicked} ticked. ICEFALL is taking your word for ${counts.completedTicked === 1 ? "that one" : "those"}.`
        : `${sentence(window.label)} asked for ${plural(counts.prescribed, "session")}. ${completed} ${completed === 1 ? "was" : "were"} completed with a recorded activity that met what the session asked for.`,
    figures: [
      `${counts.prescribed} prescribed`,
      `${counts.completedRecorded} recorded`,
      `${counts.completedTicked} ticked`,
      `${counts.missed} not completed`,
    ],
  });

  /* 2 — THE LONG DAY, WHICH IS NOT ONE SESSION OF SIX.
     The measurement behind `CONFIRM_AT_WEEK_SHARE` in `planActions.ts` found it
     takes 45–85% of a week's prescribed minutes, against 3–18% for every
     ordinary session. A review that counted it as one missed day of six would
     be arithmetically fair and practically wrong. */
  if (counts.longPrescribed > 0) {
    const missed = longDays.filter((d) => !d.done);
    out.push({
      id: "long-day",
      kind: "plan",
      text:
        missed.length === 0
          ? `The week's long mountain ${counts.longPrescribed === 1 ? "day" : "days"} went ahead. That is the session this block is built around.`
          : `${missed.map((d) => d.label).join(" and ")} ${missed.length === 1 ? "was the week's long mountain day and was" : "were the week's long mountain days and were"} not completed. It is the session the week is built around, and the one the objective actually depends on.`,
      figures: [
        `${counts.longPrescribed} long ${counts.longPrescribed === 1 ? "day" : "days"} prescribed`,
        `${counts.longMissed} not completed`,
      ],
    });
  }

  /* 3 — VOLUME. "Recorded", never "did": the two words are not the same claim. */
  out.push({
    id: "volume",
    kind: "recorded",
    text:
      counts.activityCount === 0
        ? `ICEFALL recorded nothing in ${window.label}. That is not the same as a week without training — it is what this app can see, and a session you did not record does not exist to it.`
        : `You recorded ${plural(counts.activityCount, "activity", "activities")}: ${counts.recordedMinutes} minutes and ${counts.recordedAscentM} m of ascent, against the ${counts.plannedMinutes} minutes and ${counts.plannedAscentM} m the week prescribed.`,
    figures: [
      `${counts.recordedMinutes} min recorded`,
      `${counts.plannedMinutes} min prescribed`,
      `${counts.recordedAscentM} m recorded`,
      `${counts.plannedAscentM} m prescribed`,
    ],
  });

  /* 4 — WHAT ANYBODY CHANGED. A week that was eased on Wednesday and then
     "missed" on Thursday is a different week from one nobody touched, and the
     athlete is entitled to see both facts in the same list. */
  if (counts.changeCount > 0) {
    out.push({
      id: "changes",
      kind: "plan",
      text: `${plural(counts.changeCount, "change")} ${counts.changeCount === 1 ? "was" : "were"} made to this week's days. Each is on Plan changes with its reason and who made it.`,
      figures: [`${counts.changeCount} ${counts.changeCount === 1 ? "record" : "records"}`],
    });
  }

  /* 5 — CHECK-INS. Counted, never averaged, always labelled as their own report. */
  out.push(
    checkIns.count > 0 && checkIns.lowest
      ? {
          id: "check-ins",
          kind: "self-reported",
          text: `You checked in on ${checkIns.count} of the week's days. The lowest energy you reported was ${checkIns.lowest.energy} out of 5, on ${readableDay(checkIns.lowest.date)}. That is your own report rather than a measurement, and ICEFALL does not average it into anything.`,
          figures: [
            `${checkIns.count} check-ins`,
            `lowest energy ${checkIns.lowest.energy}/5 on ${readableDay(checkIns.lowest.date)}`,
          ],
        }
      : {
          id: "check-ins",
          kind: "self-reported",
          text: `No check-ins were filed in ${window.label}, so nothing in this review rests on how you said you felt.`,
          figures: ["0 check-ins"],
        },
  );

  /* 6 — RECORDED, BUT SHORT OF THE SESSION. "Missed" reads as "did nothing",
     and for these days that would be untrue. */
  const short = sessions.filter((d) => !d.done && d.activities.length > 0);
  if (short.length > 0) {
    out.push({
      id: "short",
      kind: "recorded",
      text: `On ${short.map((d) => d.label).join(", ")} you recorded something that did not reach what the session asked for. ICEFALL counts a session done at 60% of what was prescribed, so ${short.length === 1 ? "that day is" : "those days are"} not counted — but ${short.length === 1 ? "it was not" : "they were not"} a day off either.`,
      figures: short.map(
        (d) => `${d.label}: ${plural(d.activities.length, "activity", "activities")} recorded`,
      ),
    });
  }

  /* 7 — WHAT IS LEFT BEFORE THE DATE. The roadmap's register, and every number
     in it comes from the plan and the objective rather than from prose. */
  out.push({
    id: "objective",
    kind: "plan",
    text:
      objective.daysAway > 0
        ? `${objective.name} is ${plural(objective.daysAway, "day")} away, on ${readableDay(objective.targetDate)}. ${
            objective.longDaysRemaining > 0
              ? `${sentence(plural(objective.longDaysRemaining, "long mountain day"))} remain in the plan before then.`
              : "No long mountain days remain in the plan before then."
          }`
        : `${objective.name} was set for ${readableDay(objective.targetDate)}, which has passed. Setting a new date on the objective rebuilds the plan around it.`,
    figures: [
      `${objective.daysAway} days to go`,
      `${objective.longDaysRemaining} long days remaining`,
    ],
  });

  return out;
}

/* -------------------------------------------------------------------------- */
/* Proposals — actions, in the same vocabulary the model gets                   */
/* -------------------------------------------------------------------------- */

/**
 * The hardest day of a week — the one worth easing when somebody is stepping
 * back into training.
 *
 * The long mountain day where there is one, because it is the session the week
 * is built around. Otherwise the longest prescribed session. Ties break on the
 * earliest date, so the choice is deterministic rather than a consequence of
 * array order.
 */
function hardestDay(week: TrainingWeek): TrainingDay | null {
  const sessions = week.days.filter((d) => d.focus !== "rest");
  if (sessions.length === 0) return null;
  const long = sessions.filter((d) => d.focus === "long-mountain");
  const pool = long.length > 0 ? long : sessions;
  return [...pool].sort((a, b) => {
    const byMinutes = (b.durationMin ?? 0) - (a.durationMin ?? 0);
    return byMinutes !== 0 ? byMinutes : a.date.localeCompare(b.date);
  })[0];
}

/**
 * Has somebody already made this kind of change to this day?
 *
 * DERIVED FROM THE RECORDS, NOT FROM A "DISMISSED" FLAG. A proposal that was
 * accepted leaves an adjustment behind, and that adjustment is the truth about
 * the plan. Checking it means the review cannot offer the same change twice,
 * cannot re-offer one the athlete already took, and needs no second store kept
 * in step with the first.
 */
function alreadyChanged(
  adjustments: readonly PlanAdjustment[],
  date: string,
  kind: PlanAdjustment["change"]["kind"],
): boolean {
  return adjustments.some((a) => a.date === date && a.change.kind === kind);
}

function buildProposals(args: {
  plan: TrainingPlan;
  week: TrainingWeek;
  window: ReviewWindow;
  counts: ReviewCounts;
  byDate: ReadonlyMap<string, ReviewActivity[]>;
  completedByDate: ReadonlyMap<string, boolean>;
  objective: ReviewObjective;
  adjustments: readonly PlanAdjustment[];
  today: string;
}): ReviewProposal[] {
  const { plan, week, window, counts, objective, adjustments, today } = args;
  const out: ReviewProposal[] = [];

  /* EVERYTHING BELOW CHANGES THE WEEK AHEAD, never the week reviewed. The
     reviewed week is over, and `planActions.dayProblem` refuses a day that has
     gone — quite right, since rewriting what the plan asked for on a day
     somebody already lived changes their preparation figure retrospectively.
     With no week ahead there is nothing to propose, and a review that is purely
     a description is a complete outcome rather than a failure. */
  const next = weekAfter(plan, week);
  if (!next) return out;

  /* ---------------------------------------------------------------------- */
  /* R1 — THE LONG DAY KEEPS LANDING ON A DIFFERENT DAY OF THE WEEK          */
  /* ---------------------------------------------------------------------- */

  /**
   * THE TRIGGER IS A PATTERN IN RECORDED ACTIVITY, not an assumption about why
   * somebody missed a Saturday. Across the last three finished weeks: the
   * prescribed long day was not completed, and the athlete's longest recording
   * that week fell on a different weekday — the SAME different weekday, at
   * least twice.
   *
   * That is the athlete telling the app, in recordings rather than words, when
   * their long day actually is. The change is a MOVE, which is volume-neutral:
   * nothing is taken away and nothing is added, so the objective is not quietly
   * downgraded to fit a calendar. It still goes through the guard, which will
   * refuse it if it would make a downgraded today harder.
   */
  const pattern = displacedLongDay(args, next);
  if (pattern && !alreadyChanged(adjustments, pattern.from, "move")) {
    out.push({
      id: `move-long-${pattern.from}`,
      action: {
        tool: "move_session",
        date: pattern.from,
        to: pattern.to,
        why: `Weekly review: your longest session landed on ${WEEKDAY_NAME[pattern.weekday]} in ${pattern.weeks} of the last ${PATTERN_WEEKS} weeks.`,
      },
      rationale: `Your plan puts the long mountain day on ${WEEKDAY_NAME[weekday(pattern.from)]}. In ${pattern.weeks} of the last ${PATTERN_WEEKS} finished weeks that day was not completed, while your longest recorded activity fell on ${WEEKDAY_NAME[pattern.weekday]}. Moving it changes nothing about the work — the same session, on the day you are already doing it.`,
      basis: pattern.basis,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* R2 — STEPPING BACK IN AFTER A WEEK THAT MOSTLY DID NOT HAPPEN           */
  /* ---------------------------------------------------------------------- */

  /**
   * TWO CONDITIONS, AND THE SECOND IS THE HONEST ONE.
   *
   *   · the week recorded less than half the minutes it prescribed, AND
   *   · at least one activity was recorded in it.
   *
   * Without the second, this rule would read a week of unrecorded training as a
   * week of no training and ease somebody's plan on the strength of the app's
   * own blindness. With it, the athlete is demonstrably recording, so the
   * shortfall is a shortfall.
   *
   * It also only fires when the COMING week asks for at least as much as the
   * reviewed one did. Where the plan is already tapering, the step down is
   * already there and a second one would be the review taking work off a week
   * nobody said was too much.
   *
   * The change is ONE NOTCH off ONE day. It cannot make anything harder — the
   * adjustment vocabulary has no way to — it is a single record, and it undoes
   * as a deletion.
   */
  const nextHardest = hardestDay(next);
  const nextMinutes = Math.round(
    next.days.filter((d) => d.focus !== "rest").reduce((n, d) => n + (d.durationMin ?? 0), 0),
  );
  const shortfall = counts.plannedMinutes > 0 ? counts.recordedMinutes / counts.plannedMinutes : 1;

  if (
    out.length < MAX_PROPOSALS &&
    nextHardest !== null &&
    counts.activityCount > 0 &&
    counts.plannedMinutes > 0 &&
    shortfall < RETURN_SHORTFALL &&
    nextMinutes >= counts.plannedMinutes &&
    nextHardest.date > today &&
    args.completedByDate.get(nextHardest.date) !== true &&
    !alreadyChanged(adjustments, nextHardest.date, "ease")
  ) {
    out.push({
      id: `ease-${nextHardest.date}`,
      action: {
        tool: "ease_session",
        date: nextHardest.date,
        notches: 1,
        why: `Weekly review: ${counts.recordedMinutes} of ${counts.plannedMinutes} prescribed minutes were recorded in ${window.label}.`,
      },
      rationale: `${sentence(window.label)} recorded ${counts.recordedMinutes} of the ${counts.plannedMinutes} minutes it asked for, and the coming week asks for ${nextMinutes}. ICEFALL suggests taking one notch off ${readableDay(nextHardest.date)} rather than stepping straight back to full volume.${
        objective.daysAway > 0
          ? ` ${objective.name} is ${plural(objective.daysAway, "day")} away with ${plural(objective.longDaysRemaining, "long mountain day")} left in the plan, so there is room for it.`
          : ""
      }`,
      basis: [
        `${counts.recordedMinutes} min recorded against ${counts.plannedMinutes} prescribed`,
        `${counts.missed} of ${counts.prescribed} sessions not completed`,
        `the coming week prescribes ${nextMinutes} min`,
      ],
    });
  }

  /* THE TARGET DATE IS NEVER PROPOSED HERE, and that is deliberate rather than
     an omission. `set_target_date` exists and the coach can use it in a
     conversation, but a date is a flight, a permit, a guide and a week off
     work. A review that offered to move somebody's objective because they had
     a poor week would be offering to change something it knows nothing about.
     It says how many days are left and what remains in the plan; the decision
     stays with the person who booked it. */

  return out.slice(0, MAX_PROPOSALS);
}

/**
 * Two of the last three finished weeks agreeing on a weekday, or nothing.
 *
 * For each finished week: find the prescribed long mountain day; skip the week
 * if it was completed (nothing to explain) or if there is no long day at all;
 * find the athlete's single longest recording inside that week; and if it fell
 * on a different weekday, that week votes for that weekday.
 *
 * A week with no recording does not vote. It CANNOT vote: there is no evidence
 * in it about when this person trains, and a week of silence must not be read
 * as agreement with the weeks around it.
 */
function displacedLongDay(
  args: {
    plan: TrainingPlan;
    byDate: ReadonlyMap<string, ReviewActivity[]>;
    completedByDate: ReadonlyMap<string, boolean>;
    today: string;
  },
  next: TrainingWeek,
): { from: string; to: string; weekday: number; weeks: number; basis: string[] } | null {
  const finished = finishedWeeks(args.plan, args.today).slice(-PATTERN_WEEKS);
  if (finished.length < PATTERN_MIN) return null;

  const votes = new Map<number, string[]>();

  for (const w of finished) {
    const long = w.days.find((d) => d.focus === "long-mountain");
    if (!long) continue;
    if (args.completedByDate.get(long.date) === true) continue;

    const from = w.startDate;
    const to = lastDateOf(w);
    let best: { date: string; durationSec: number } | null = null;
    for (const [date, list] of args.byDate) {
      if (date < from || date > to) continue;
      for (const a of list) {
        /* Longest session wins; an exact tie breaks on the earlier date, so
           the answer does not depend on Map insertion order. */
        if (
          best === null ||
          a.durationSec > best.durationSec ||
          (a.durationSec === best.durationSec && date < best.date)
        ) {
          best = { date, durationSec: a.durationSec };
        }
      }
    }
    if (best === null) continue;

    const wd = weekday(best.date);
    if (wd === weekday(long.date)) continue;
    votes.set(wd, [
      ...(votes.get(wd) ?? []),
      `${readableDay(long.date)} not completed; your longest recording that week was ${readableDay(best.date)}`,
    ]);
  }

  /* Most votes wins; an exact tie breaks on the earlier weekday, for the same
     determinism reason as above. */
  const best = [...votes.entries()].sort((a, b) =>
    b[1].length !== a[1].length ? b[1].length - a[1].length : a[0] - b[0],
  )[0];
  if (!best || best[1].length < PATTERN_MIN) return null;

  const [wd, basis] = best;
  const from = next.days.find((d) => d.focus === "long-mountain");
  const to = next.days.find((d) => weekday(d.date) === wd);

  /* Every one of these refusals is a case where the proposal would be refused
     downstream anyway. Emitting it and letting `previewAction` say no would
     show the athlete a change ICEFALL already knew it could not make. */
  if (!from || !to) return null;
  if (from.date === to.date) return null;
  if (from.date <= args.today || to.date <= args.today) return null;
  if (args.completedByDate.get(from.date) === true) return null;
  if (args.completedByDate.get(to.date) === true) return null;

  return { from: from.date, to: to.date, weekday: wd, weeks: basis.length, basis };
}
