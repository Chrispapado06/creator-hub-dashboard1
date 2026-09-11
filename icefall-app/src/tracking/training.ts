import { useMemo } from "react";
import { isoDate, startOfWeek } from "@/data/mock/clock";
import { sync } from "@/services/repository";
import { useApp } from "@/state/AppState";
import {
  applyAdjustments,
  livePlanAdjustments,
  rescaleToMinutes,
  useAdjustments,
  type StrandedAdjustment,
} from "./adjustments";
import { useActivityFeed } from "./feed";
import { PLAN_MAX_WEEKS, PLAN_MIN_WEEKS } from "./planLength";
import type {
  Activity,
  Difficulty,
  Goal,
  Mountain,
  TrainingDay,
  TrainingFocus,
  TrainingPlan,
  TrainingWeek,
} from "@/types";

/**
 * Goal-driven training.
 *
 * The plan used to be a single fixture hardcoded to Mont Blanc: choosing any
 * other objective — or writing your own — still produced a Mont Blanc block,
 * and nothing you recorded ever changed it. This module generates the plan from
 * the objective, marks sessions off against activities you actually did, and
 * derives goal preparation from both.
 */

const MS_WEEK = 7 * 86_400_000;
/* The clamp on a generated plan's length. Defined in `./planLength`, a leaf
   module, because `objectives/nextObjective.ts` has to quote MIN_WEEKS to an
   athlete choosing a date and must not import this file to do it. */
const MIN_WEEKS = PLAN_MIN_WEEKS;
const MAX_WEEKS = PLAN_MAX_WEEKS;
/** Sessions that must be observable before consistency is trusted fully. */
const MIN_OBSERVED_SESSIONS = 12;

/* -------------------------------------------------------------------------- */
/* Plan generation                                                             */
/* -------------------------------------------------------------------------- */

interface DayTemplate {
  focus: TrainingFocus;
  title: string;
  detail?: string;
  difficulty: Difficulty;
  distanceKm?: number;
  elevationM?: number;
  durationMin?: number;
}

/**
 * What the athlete told us about their WEEK, as opposed to their objective.
 *
 * Until now these three signup answers were collected, written to the coach
 * profile, and read by exactly one place each: a line of the model's system
 * prompt. The week itself was a fixed six sessions and a Thursday rest —
 * identical for somebody who gave three days and somebody who gave seven, and
 * identical in week 1 for a beginner and for an athlete already training five
 * days. Every screen said so in words, which kept it honest but did not make
 * it right.
 *
 * A prompt line is not a wiring. The model can only describe what an engine
 * did, so an answer that exists only in the prompt invites it to describe an
 * adjustment nobody made. These three now reach the generator, and the copy
 * that used to disclaim them was rewritten in the same commit.
 *
 * `null` AND `[]` ARE NAMED ABSENCES and must stay that way. They mean never
 * asked — everybody who signed up before these questions existed — and an
 * athlete who was never asked keeps exactly the week they have today. Do not
 * give any field here a default value: a default is an answer nobody gave.
 */
export interface TrainingShape {
  /** 0 = Sunday … 6 = Saturday. Empty = "no fixed days", or never asked. */
  trainingDays: number[];
  /** Minutes the athlete calls a normal session. `null` = never answered. */
  typicalSessionMin: number | null;
  /** A signup baseline id — "none" … "5-plus". `null` = never answered. */
  trainingBaseline: string | null;
}

/**
 * Monday-first weekday offsets: 0 = Monday … 6 = Sunday.
 *
 * This is the week ICEFALL built for everybody before it asked — sessions
 * Monday to Wednesday and Friday to Sunday, rest on Thursday. It is still what
 * an athlete who gave no days gets, because "no fixed days" and "never asked"
 * are both the absence of an answer, and neither is licence to invent one.
 */
const DEFAULT_OFFSETS = [0, 1, 2, 4, 5, 6];

/**
 * One day of every week is a rest day, however many days the athlete offers.
 *
 * Somebody who ticks all seven is not given seven sessions. That is the one
 * place the generator overrides the answer, and it is a coaching decision
 * rather than a shrug — so the seventh day is not silently blanked: it carries
 * a rest day that says the plan is keeping it back.
 */
const MAX_SESSIONS_PER_WEEK = 6;

/** No plan starts below two sessions. Below that there is no week to build. */
const MIN_START_SESSIONS = 2;

/** The shortest a build-up runs, even when it is only one session wide. */
const MIN_RAMP_WEEKS = 4;

/**
 * Days a week the athlete says they ALREADY train, per signup answer.
 *
 * The LOWER end of each band on purpose: starting a build from the optimistic
 * reading of "1–2 days" is the direction that hurts people. "Occasionally" is
 * described to the athlete as less than once a week, so it counts as one.
 */
const BASELINE_DAYS: Record<string, number> = {
  none: 0,
  occasional: 1,
  "1-2": 2,
  "3-4": 3,
  "5-plus": 5,
};

/**
 * Week-1 volume as a fraction of what the block would otherwise ask for.
 *
 * A COACHING JUDGEMENT, not a measurement, and it is never printed as one. The
 * reference is an athlete already training three to four days a week, because
 * that is who the existing blocks were written for — which is why "3-4" is 1.0
 * and nothing here is above it. Being fitter than the reference does not earn a
 * heavier first week; the blocks already progress.
 */
const BASELINE_LOAD: Record<string, number> = {
  none: 0.6,
  occasional: 0.7,
  "1-2": 0.85,
  "3-4": 1,
  "5-plus": 1,
};

interface SessionTemplate extends DayTemplate {
  /**
   * What survives when the week has to shrink, lowest first.
   *
   * Also a coaching judgement. An athlete who can give two days needs the two
   * that carry the objective — the long day, and the strength work that
   * protects the knees on the way down — not a prescribed recovery walk. The
   * recovery sessions are real work for somebody training six days; they are
   * the first thing to go for somebody training two.
   */
  keep: number;
}

const FULL_REST: DayTemplate = {
  focus: "rest",
  title: "Rest",
  detail: "Full rest. Adaptation happens here.",
  difficulty: 1,
};

/**
 * The six sessions of a full week, in the order they sit across it.
 *
 * `load` scales volume with the block, `demand` with how serious the objective
 * is — a Toubkal build should not look like an Everest build.
 */
function sessionsFor(
  block: string,
  load: number,
  demand: number,
  verticalFocus: boolean,
): SessionTemplate[] {
  const s = (n: number) => Math.max(1, Math.round(n * load * demand));
  const peaking = block.startsWith("Peak");

  return [
    {
      focus: "recovery",
      title: "Recovery",
      detail: "Easy movement, mobility",
      difficulty: 1,
      durationMin: 30,
      keep: 5,
    },
    {
      focus: "endurance",
      title: "Endurance Run",
      /* NOT "Zone 2 throughout". ICEFALL has never measured anyone's maximum,
         resting or threshold heart rate, so a zone is a measurement printed
         where none was taken. (A paired Bluetooth strap does give a live
         reading — it is the ceiling to divide it by that has never existed.)
         The rule is argued in full in `coach/sessionIntent.ts`, and this
         module shipped the exact string those paragraphs forbid.
         Replaced with effort the athlete can verify against themselves. */
      detail: "Steady and conversational throughout",
      difficulty: 2,
      distanceKm: s(12),
      elevationM: s(420),
      durationMin: s(75),
      keep: 2,
    },
    {
      focus: "strength",
      title: "Strength — Lower Body",
      detail: "Split squats, step-ups, calf raises, core",
      difficulty: 3,
      durationMin: s(60),
      keep: 1,
    },
    peaking
      ? {
          focus: "intervals",
          title: "Uphill Intervals",
          detail: "6 × 4 min hard uphill, 3 min easy",
          difficulty: 4,
          durationMin: s(70),
          keep: 3,
        }
      : {
          focus: verticalFocus ? "technical" : "endurance",
          title: verticalFocus ? "Technical Session" : "Tempo Run",
          detail: verticalFocus
            ? "Crampon and axe work, rope systems"
            : "Sustained threshold effort",
          difficulty: 4,
          durationMin: s(70),
          keep: 3,
        },
    {
      focus: "long-mountain",
      title: "Long Mountain Session",
      detail: "Sustained vertical with a loaded pack",
      difficulty: 4,
      distanceKm: s(18),
      elevationM: s(1200),
      durationMin: s(300),
      keep: 0,
    },
    {
      focus: "recovery",
      title: "Recovery Walk",
      detail: "Flat, conversational pace",
      difficulty: 1,
      distanceKm: s(6),
      durationMin: s(60),
      keep: 4,
    },
  ];
}

/**
 * Hold a session to the length the athlete called normal.
 *
 * THE LONG MOUNTAIN DAY IS DELIBERATELY EXEMPT, and not as a convenience. The
 * question that produces this number asks "how long is a normal session —
 * roughly, on a day you are not doing something long in the mountains". The
 * long day is outside the scope of the answer by the wording of the question,
 * so cutting it to this number would be reading the athlete as having said
 * something they were never asked. The payoff screen states that scope, so an
 * athlete who sees a four-hour Saturday knows why it is there.
 *
 * Distance and vertical are scaled with the time rather than left standing.
 * 12 km inside 30 minutes is not a shortened session, it is an impossible one,
 * and it would be a fabricated figure printed as a prescription.
 */
function capped(t: SessionTemplate, capMin: number | null): DayTemplate {
  const day: DayTemplate = {
    focus: t.focus,
    title: t.title,
    detail: t.detail,
    difficulty: t.difficulty,
    distanceKm: t.distanceKm,
    elevationM: t.elevationM,
    durationMin: t.durationMin,
  };
  if (capMin === null || day.focus === "long-mountain") return day;
  if (!day.durationMin || day.durationMin <= capMin) return day;

  /* THE ARITHMETIC LIVES IN `adjustments.ts` AND IS CALLED FROM BOTH PLACES.
     A coach shortening a session to the time the athlete has on the day does
     exactly this sum; two copies would disagree the first time either is
     tuned, and the athlete would read one distance on the plan screen and
     another on the session screen. */
  const cut = rescaleToMinutes(day, capMin);
  return {
    ...cut,
    detail: cut.detail
      ? `${cut.detail}. Cut to the ${capMin} min you called normal.`
      : `Cut to the ${capMin} min you called normal.`,
  };
}

/**
 * Which of the athlete's days carry this week's sessions.
 *
 * Spread across the days they gave rather than taken from the front, so an
 * athlete offering seven days and receiving six gets the rest day in the middle
 * of the week and not tacked onto the end. The arithmetic reproduces the old
 * fixed week exactly — seven days, six sessions, rest on Thursday — so ticking
 * every day lands an athlete where everyone used to be.
 */
function spread(offsets: number[], count: number): number[] {
  if (count >= offsets.length) return offsets;
  if (count <= 0) return [];
  if (count === 1) return [offsets[Math.floor((offsets.length - 1) / 2)]];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(offsets[Math.round((i * (offsets.length - 1)) / (count - 1))]);
  }
  return [...new Set(out)];
}

/**
 * A week, laid out Monday to Sunday.
 *
 * ALWAYS SEVEN ENTRIES. Every screen that renders a week indexes this array as
 * a calendar week — Home's day strip, the plan's day rows, the day labels on
 * the Coach plan — so a variable-length week would mislabel days rather than
 * shorten anything. A day the athlete cannot train is a rest day, which is what
 * it actually is.
 */
function weekTemplate(
  block: string,
  load: number,
  demand: number,
  verticalFocus: boolean,
  offsets: number[],
  sessionCount: number,
  capMin: number | null,
): DayTemplate[] {
  const chosen = sessionsFor(block, load, demand, verticalFocus).filter(
    (x) => x.keep < sessionCount,
  );
  const used = spread(offsets, Math.min(chosen.length, offsets.length));
  const usedOn = new Map<number, SessionTemplate>();
  used.forEach((off, i) => usedOn.set(off, chosen[i]));

  const offered = new Set(offsets);
  // The days this athlete's week will use once the build-up is finished, so a
  // day resting THIS week can be told apart from the one the plan keeps back
  // permanently.
  const eventually = new Set(spread(offsets, Math.min(offsets.length, MAX_SESSIONS_PER_WEEK)));

  return Array.from({ length: 7 }, (_, i) => {
    const session = usedOn.get(i);
    if (session) return capped(session, capMin);
    if (!offered.has(i)) return FULL_REST;
    // A day the athlete GAVE us that this week does not use. Saying which of
    // the two reasons applies is the point: an answer taken and then quietly
    // ignored is the failure this whole change exists to end.
    return eventually.has(i)
      ? { ...FULL_REST, detail: "Rest. You gave us this day — the plan is building up to it." }
      : { ...FULL_REST, detail: "Full rest. You gave us every day; the plan keeps one back." };
  });
}

/**
 * How the first weeks are held back for somebody who is not training yet.
 *
 * Two things ramp together and reach full at the same time: how many sessions a
 * week there are, and how much volume each carries. Both start from what the
 * athlete says they are ALREADY doing, because the alternative — the one this
 * replaces — handed a beginner and a five-day athlete the identical week 1.
 */
interface Ramp {
  /** Sessions in week 1. */
  startSessions: number;
  /** Sessions once the build-up is done: the athlete's own days, capped at six. */
  capacity: number;
  /** Volume multiplier in week 1, reaching 1 at week `weeks + 1`. */
  startLoad: number;
  /** How long the build-up runs. 0 when there is nothing to build up from. */
  weeks: number;
}

function rampFor(shape: TrainingShape | undefined, capacity: number): Ramp {
  const id = shape?.trainingBaseline ?? null;
  // Never asked, or an id this table does not know: no ramp at all. Guessing a
  // starting point for an athlete who never gave one is how a plan starts
  // claiming things about somebody.
  if (id === null || !(id in BASELINE_DAYS)) {
    return { startSessions: capacity, capacity, startLoad: 1, weeks: 0 };
  }

  const already = BASELINE_DAYS[id];
  // One session more than they are already doing. Nobody measured this; it is
  // the smallest step that is still a step.
  const startSessions = Math.min(capacity, Math.max(MIN_START_SESSIONS, already + 1));
  const startLoad = BASELINE_LOAD[id] ?? 1;
  const weeks =
    startSessions >= capacity && startLoad >= 1
      ? 0
      : Math.max(MIN_RAMP_WEEKS, 2 * (capacity - startSessions));

  return { startSessions, capacity, startLoad, weeks };
}

/** One session added every second week until the athlete's own days are full. */
function sessionsInWeek(week: number, ramp: Ramp): number {
  if (ramp.weeks === 0) return ramp.capacity;
  return Math.min(ramp.capacity, ramp.startSessions + Math.floor((week - 1) / 2));
}

/** Volume climbs linearly from the baseline multiplier to the block's own load. */
function loadScaleInWeek(week: number, ramp: Ramp): number {
  if (ramp.weeks === 0) return 1;
  const p = Math.min(1, (week - 1) / ramp.weeks);
  return ramp.startLoad + (1 - ramp.startLoad) * p;
}

/** The athlete's days as Monday-first offsets, or the week they had before. */
function offsetsFor(shape?: TrainingShape): number[] {
  const offsets = [
    ...new Set(
      (shape?.trainingDays ?? [])
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        .map((d) => (d + 6) % 7),
    ),
  ].sort((a, b) => a - b);
  return offsets.length > 0 ? offsets : DEFAULT_OFFSETS;
}

/**
 * The shape of the week this athlete's answers actually produce.
 *
 * Exported because the signup payoff screen states, per answer, what that
 * answer changed — and it must read those numbers back out of the generator
 * rather than describe them by hand. A screen that reprints the intent of this
 * file is a screen that will one day disagree with it.
 */
export interface PlanShapeSummary {
  /** Sessions in week 1. */
  startSessions: number;
  /** Sessions a week once the build-up is done. */
  fullSessions: number;
  /** Weeks the build-up runs for. 0 when there is none. */
  rampWeeks: number;
  /** Days the athlete offered that the plan keeps as rest, whatever the week. */
  heldBackDays: number;
  /** The cap applied to everything but the long mountain day, if any. */
  cappedAtMin: number | null;
}

export function planShapeFor(shape?: TrainingShape): PlanShapeSummary {
  const offsets = offsetsFor(shape);
  const capacity = Math.min(offsets.length, MAX_SESSIONS_PER_WEEK);
  const ramp = rampFor(shape, capacity);
  return {
    startSessions: sessionsInWeek(1, ramp),
    fullSessions: capacity,
    rampWeeks: ramp.weeks,
    heldBackDays: offsets.length - capacity,
    cappedAtMin: shape?.typicalSessionMin ?? null,
  };
}

/**
 * How many sessions a GIVEN week of the build-up carries.
 *
 * `planShapeFor` answers for week 1 only, because that is all the signup payoff
 * screen needed. `coach/sessionReason.ts` has to say "four sessions this week,
 * reaching six at week nine" on whatever week the athlete is looking at, and
 * the figure has to be the generator's own rather than a screen's arithmetic
 * over `startSessions` — the ramp adds one session every SECOND week, and a
 * reader reconstructing that from the summary would get it wrong on the odd
 * weeks and be believed anyway.
 */
export function planSessionsInWeek(shape: TrainingShape | undefined, week: number): number {
  const offsets = offsetsFor(shape);
  const capacity = Math.min(offsets.length, MAX_SESSIONS_PER_WEEK);
  return sessionsInWeek(week, rampFor(shape, capacity));
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The four phases every plan moves through.
 *
 * EXPORTED BECAUSE SOMETHING ELSE NOW READS THEM BACK. `coach/sessionReason.ts`
 * derives the sentence that tells an athlete why today's session is the size it
 * is, and the only honest source for "a Peak week carries a quarter more volume
 * than a Build week" is the table that actually produced the number. A second
 * copy of these figures in a prose module is a copy that goes wrong the first
 * time either is tuned — and goes wrong on screen, stated as fact, which is
 * worse than never having said it.
 */
export type BlockKind = "base" | "build" | "peak" | "taper";

/** Volume multiplier per phase. `build` is 1 by definition: it is the reference. */
export const BLOCK_LOAD: Record<BlockKind, number> = {
  base: 0.8,
  build: 1,
  peak: 1.25,
  taper: 0.55,
};

/** What a deload week multiplies its block's own load by. */
export const DELOAD_SCALE = 0.65;

/** Every Nth week is a deload, except inside the closing weeks of the plan. */
export const DELOAD_EVERY = 4;

/** How a block label says the week is a deload. Read back by `parseBlockLabel`. */
export const DELOAD_SUFFIX = " · deload";

const BLOCK_PREFIX: Record<BlockKind, string> = {
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
};

/**
 * A stored week's `block` string, back into the two facts that made it.
 *
 * `TrainingWeek.block` is the only place a week carries its phase, and it is a
 * DISPLAY string — so anything reasoning about the phase has to read it back
 * out. Doing that with `startsWith` at a call site would put a second, silent
 * contract on this file's wording; doing it here means a label change breaks
 * one function instead of leaking a wrong sentence onto a screen.
 *
 * Returns null for anything this file did not write. A caller that cannot
 * identify the phase must say nothing about it rather than guess.
 */
export function parseBlockLabel(label: string): { kind: BlockKind; deload: boolean } | null {
  const deload = label.endsWith(DELOAD_SUFFIX);
  const name = deload ? label.slice(0, -DELOAD_SUFFIX.length) : label;
  const kind = (Object.keys(BLOCK_PREFIX) as BlockKind[]).find(
    (k) => name === BLOCK_PREFIX[k] || name.startsWith(`${BLOCK_PREFIX[k]} `),
  );
  return kind ? { kind, deload } : null;
}

/** Base → Build → Peak → Taper, proportional to however long the plan is. */
function blockFor(week: number, total: number): { name: string; load: number } {
  const p = week / total;
  if (p <= 0.28)
    return { name: `${BLOCK_PREFIX.base} ${Math.ceil(week / 3)}`, load: BLOCK_LOAD.base };
  if (p <= 0.65)
    return {
      name: `${BLOCK_PREFIX.build} ${Math.ceil((week - total * 0.28) / 4)}`,
      load: BLOCK_LOAD.build,
    };
  if (p <= 0.92)
    return {
      name: `${BLOCK_PREFIX.peak} ${Math.ceil((week - total * 0.65) / 4)}`,
      load: BLOCK_LOAD.peak,
    };
  return { name: BLOCK_PREFIX.taper, load: BLOCK_LOAD.taper };
}

/**
 * How demanding the objective is, from the mountain or the goal's altitude.
 *
 * FINDING, 2026-09-10, ACTED ON 2026-09-11 — READ BEFORE CHANGING. With no
 * curated `mountain` this function scales the volume from `elevationM / 1600`,
 * a coefficient with no source. That is the ONE elevation-only inference that
 * survives for an unsurveyed peak, and it survives because the screens say so
 * in words (`REFERENCE_PLAN_NOTE`: "a general altitude programme"). Two others
 * did not survive:
 *
 *   · `verticalFocus` prescribed a "Technical Session — crampon and axe work,
 *     rope systems" for EVERY goal above 3,500 m. Measured live on Erciyes
 *     Dağı, a summer walk-up volcano with no glacier: a rope-and-crampon
 *     session on Home, on the Coach hub and in the plan. A rope requirement
 *     asserted from height alone is a technical judgement about the ground,
 *     which is the thing a reference entry may not carry. The focus now comes
 *     from the curated difficulty only.
 *   · `requiredAscent` in `computePreparation` fell back to `elevationM *
 *     0.45` and printed it as "1,763 m needed". No route on Erciyes needs
 *     1,763 m; the number was made up. Capability is now scored against a
 *     surveyed route or not at all.
 *
 * Whether an elevation-scaled volume programme should exist at all is still the
 * owner's call; it is labelled, not withheld.
 */
export function demandFor(goal: Goal, mountain?: Mountain): number {
  if (mountain) return 0.7 + mountain.difficulty * 0.13;
  if (goal.elevationM) return 0.7 + Math.min(5, goal.elevationM / 1600) * 0.13;
  return 1;
}

/**
 * The plan, from the objective, the date, and the athlete's own week.
 *
 * STILL A PURE FUNCTION, and it must stay one. Nothing here is persisted and
 * nothing reads state: give it the same goal, the same clock and the same shape
 * and it returns the same plan. `shape` is an argument rather than a lookup for
 * that reason — the day this function reaches for a store is the day the plan
 * silently differs between two screens that were meant to show the same thing.
 *
 * `shape` omitted is a real and supported case, not a shortcut: it is the week
 * every athlete had before the answers were wired up, and it is what somebody
 * who was never asked still gets.
 */
export function buildPlanForGoal(
  goal: Goal,
  mountain?: Mountain,
  now = new Date(),
  shape?: TrainingShape,
): TrainingPlan {
  const target = new Date(goal.targetDate);
  const started = goal.trainingStartedAt ? new Date(goal.trainingStartedAt) : now;

  const spanWeeks = Math.round((target.getTime() - started.getTime()) / MS_WEEK);
  const totalWeeks = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, spanWeeks));

  // Week 1 begins on the Monday of the week training started.
  const planStart = startOfWeek(started);
  const elapsed = Math.floor((now.getTime() - planStart.getTime()) / MS_WEEK);
  const currentWeek = Math.min(totalWeeks, Math.max(1, elapsed + 1));

  const demand = demandFor(goal, mountain);
  // Technical ground is a judgement a person made about a surveyed mountain.
  // Without one there is no crampon-and-rope session, whatever the height —
  // see `demandFor` for the volcano that was prescribed crevasse rescue.
  const verticalFocus = (mountain?.difficulty ?? 0) >= 4;

  // The athlete's own week: which days are theirs, how many sessions those days
  // can carry, and how far below that the plan has to start them.
  const offsets = offsetsFor(shape);
  const capacity = Math.min(offsets.length, MAX_SESSIONS_PER_WEEK);
  const ramp = rampFor(shape, capacity);
  const capMin = shape?.typicalSessionMin ?? null;

  const weeks: TrainingWeek[] = [];
  for (let w = 1; w <= totalWeeks; w++) {
    const monday = new Date(planStart);
    monday.setDate(monday.getDate() + (w - 1) * 7);

    const { name, load } = blockFor(w, totalWeeks);
    const isDeload = w % DELOAD_EVERY === 0 && w < totalWeeks - 3;
    // The block's load and the athlete's build-up multiply: a deload week for
    // somebody in week 2 of their first ever plan is lighter than both.
    const tpl = weekTemplate(
      name,
      (isDeload ? load * DELOAD_SCALE : load) * loadScaleInWeek(w, ramp),
      demand,
      verticalFocus,
      offsets,
      sessionsInWeek(w, ramp),
      capMin,
    );

    const days: TrainingDay[] = tpl.map((d, i) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + i);
      return {
        date: isoDate(date),
        focus: d.focus,
        title: d.title,
        detail: d.detail,
        distanceKm: d.distanceKm,
        elevationM: d.elevationM,
        durationMin: d.durationMin,
        difficulty: d.difficulty,
        // Never pre-ticked. A session is done when an activity did the work or
        // the athlete says so — inventing completion inflated preparation for a
        // goal set five minutes ago.
        completed: false,
      };
    });

    weeks.push({
      index: w,
      block: isDeload ? `${name}${DELOAD_SUFFIX}` : name,
      startDate: isoDate(monday),
      days,
    });
  }

  return {
    id: `plan-${goal.id}`,
    goalId: goal.id,
    title: `${goal.name} — ${totalWeeks} weeks`,
    totalWeeks,
    currentWeek,
    weeks,
  };
}

/* -------------------------------------------------------------------------- */
/* Did an activity satisfy the session?                                        */
/* -------------------------------------------------------------------------- */

/** A session counts as done at 60% of what was prescribed — training is not homework. */
const SATISFY = 0.6;

export function activitySatisfies(day: TrainingDay, acts: Activity[]): boolean {
  if (day.focus === "rest" || acts.length === 0) return false;

  const distanceKm = acts.reduce((a, x) => a + x.distanceKm, 0);
  const elevationM = acts.reduce((a, x) => a + x.elevationGainM, 0);
  const minutes = acts.reduce((a, x) => a + x.durationSec / 60, 0);

  if (day.elevationM) return elevationM >= day.elevationM * SATISFY;
  if (day.distanceKm) return distanceKm >= day.distanceKm * SATISFY;
  if (day.durationMin) return minutes >= day.durationMin * SATISFY;
  return true; // an untargeted session is satisfied by showing up
}

/* -------------------------------------------------------------------------- */
/* Preparation                                                                 */
/* -------------------------------------------------------------------------- */

export interface PreparationBreakdown {
  percent: number;
  /** Shown on the goal so the number is never a mystery. */
  parts: { label: string; percent: number; detail: string }[];
}

/**
 * Preparation is derived, not declared. Three components:
 *   consistency  — sessions completed out of those prescribed so far
 *   capability   — biggest single-day ascent against what the objective demands
 *   time         — how far through the build you are
 *
 * CAPABILITY EXISTS ONLY AGAINST A SURVEYED ROUTE. It is the biggest recorded
 * ascent against the route's vertical gain, and a reference entry has no
 * route: the old fallback of `elevationM * 0.45` was a number with no source,
 * printed on the Training screen as "of 1,763 m needed". For a goal without a
 * curated mountain the figure is consistency and time alone, renormalised, and
 * every screen that prints it calls it plan completion rather than readiness —
 * `services/peakTier.ts` holds the words.
 */
export function computePreparation(
  goal: Goal,
  plan: TrainingPlan,
  completedByDate: Map<string, boolean>,
  feed: Activity[],
  mountain?: Mountain,
): PreparationBreakdown {
  if (goal.status === "completed") {
    return {
      percent: 100,
      parts: [{ label: "Completed", percent: 100, detail: "Objective achieved" }],
    };
  }

  // Only judge consistency over the window ICEFALL could actually observe.
  // Counting sessions from before there was any activity data would score the
  // athlete on a period nothing was measured.
  const firstSeen = feed.reduce<string | null>((min, a) => {
    const d = isoDate(new Date(a.startedAt));
    return min === null || d < min ? d : min;
  }, null);
  const todayKey = isoDate(new Date());

  let prescribed = 0;
  let done = 0;
  for (const w of plan.weeks) {
    if (w.index > plan.currentWeek) break;
    for (const d of w.days) {
      if (d.focus === "rest") continue;
      if (d.date > todayKey) continue;
      if (firstSeen && d.date < firstSeen) continue;
      prescribed++;
      if (completedByDate.get(d.date) ?? d.completed) done++;
    }
  }
  const consistency = prescribed ? done / prescribed : 0;

  // Consistency needs a sample before it means anything. Without this, a goal
  // set this morning scored 60% off three sessions and outranked an eight-month
  // build.
  const confidence = Math.min(1, prescribed / MIN_OBSERVED_SESSIONS);
  const consistencyScore = consistency * confidence;

  const time = Math.min(1, plan.currentWeek / plan.totalWeeks);

  const consistencyPart = {
    label: "Consistency",
    percent: Math.round(consistencyScore * 100),
    detail:
      confidence < 1
        ? `${done} of ${prescribed} sessions — too few yet to judge`
        : `${done} of ${prescribed} prescribed sessions completed`,
  };
  const timePart = {
    label: "Time in the build",
    percent: Math.round(time * 100),
    detail: `Week ${plan.currentWeek} of ${plan.totalWeeks}`,
  };

  // The route's vertical gain, from the curated record. Null is a named
  // absence: no surveyed route, so nothing real to measure an ascent against.
  const requiredAscent =
    mountain?.routes.reduce((m, r) => Math.max(m, r.elevationGainM), 0) || null;

  if (requiredAscent === null) {
    const percent = Math.round(100 * (0.8 * consistencyScore + 0.2 * time));
    return { percent: Math.max(0, Math.min(100, percent)), parts: [consistencyPart, timePart] };
  }

  // Capability is limited by the weaker of two dimensions: can you climb the
  // vertical in a day, and have you been anywhere near the altitude. Judging
  // Everest on ascent alone rated it easier than Mont Blanc.
  const bestAscent = feed.reduce((m, a) => Math.max(m, a.elevationGainM), 0);
  const ascentReadiness = Math.min(1, bestAscent / requiredAscent);

  const requiredAltitude = goal.elevationM ?? mountain?.elevationM ?? 0;
  const bestAltitude = feed.reduce(
    (m, a) =>
      Math.max(
        m,
        a.track.reduce((t, p) => Math.max(t, p.ele), 0),
      ),
    0,
  );
  const altitudeReadiness = requiredAltitude ? Math.min(1, bestAltitude / requiredAltitude) : 1;

  const capability = Math.min(ascentReadiness, altitudeReadiness);

  const percent = Math.round(100 * (0.6 * consistencyScore + 0.25 * capability + 0.15 * time));

  return {
    percent: Math.max(0, Math.min(100, percent)),
    parts: [
      consistencyPart,
      {
        label: "Capability",
        percent: Math.round(capability * 100),
        detail:
          altitudeReadiness < ascentReadiness
            ? `Highest reached ${Math.round(bestAltitude).toLocaleString("en-GB")} m of ${Math.round(requiredAltitude).toLocaleString("en-GB")} m`
            : `Best single ascent ${Math.round(bestAscent).toLocaleString("en-GB")} m of ${Math.round(requiredAscent).toLocaleString("en-GB")} m needed`,
      },
      timePart,
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                       */
/* -------------------------------------------------------------------------- */

/** Activities grouped by local calendar date. */
function byDate(feed: Activity[]) {
  const m = new Map<string, Activity[]>();
  for (const a of feed) {
    const k = isoDate(new Date(a.startedAt));
    const list = m.get(k);
    if (list) list.push(a);
    else m.set(k, [a]);
  }
  return m;
}

export interface TrainingState {
  /**
   * THE BASELINE WITH THE ATHLETE'S CHANGES ON IT — not the generator's output.
   *
   * `buildPlanForGoal` is still the baseline and still pure; the stored
   * adjustments are applied on top here, once, so no screen can show a plan
   * that disagrees with another screen's. Days somebody changed carry
   * `TrainingDay.adjusted`.
   */
  plan: TrainingPlan | null;
  goal?: Goal;
  mountain?: Mountain;
  /** Effective completion per date: manual override → activity → seeded history. */
  completedByDate: Map<string, boolean>;
  /** Dates where a recorded activity did the work. */
  satisfiedByActivity: Set<string>;
  preparation: PreparationBreakdown | null;
  today?: TrainingDay;
  currentWeek: TrainingWeek | null;
  /**
   * Changes the athlete was told had been made that this plan can no longer
   * take — most often because the day they name has fallen out of the plan.
   *
   * SURFACED RATHER THAN SWALLOWED. An athlete who moved a session is entitled
   * to be told the day it moved to has gone; a screen that quietly dropped
   * these would be showing a plan that contradicts the history beside it.
   */
  strandedAdjustments: StrandedAdjustment[];
}

/**
 * The athlete's answers, in the shape the generator takes.
 *
 * Every `?? null` and `?? []` here is load-bearing: the coach profile stores an
 * absent answer as absent, and this is the boundary where that has to survive
 * rather than become a number. See `TrainingShape`.
 *
 * Exported because the session screen has to hand the SAME shape to
 * `sessionReasonFor` that this module handed the generator. A screen that read
 * the profile itself would be a second reading of the same three answers, and
 * the first time one of them is renamed the plan and the sentence explaining it
 * would disagree.
 */
export function useTrainingShape(): TrainingShape {
  const { coachProfile } = useApp();
  return useMemo(
    () => ({
      trainingDays: coachProfile.trainingDays ?? [],
      typicalSessionMin: coachProfile.typicalSessionMin ?? null,
      trainingBaseline: coachProfile.trainingBaseline ?? null,
    }),
    [coachProfile],
  );
}

export function useTraining(goalOverride?: Goal): TrainingState {
  const { goals, isSessionComplete } = useApp();
  const shape = useTrainingShape();
  const feed = useActivityFeed();
  const adjustments = useAdjustments();

  const goal = useMemo(
    () =>
      goalOverride ??
      goals
        .filter((g) => g.status === "active")
        .sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate))[0],
    [goalOverride, goals],
  );

  return useMemo(() => {
    if (!goal) {
      return {
        plan: null,
        completedByDate: new Map(),
        satisfiedByActivity: new Set(),
        preparation: null,
        currentWeek: null,
        strandedAdjustments: [],
      };
    }

    const mountain = goal.mountainId ? sync.mountainById(goal.mountainId) : undefined;
    /* Baseline, then the athlete's and the coach's changes on top of it. The
       order is the whole design: the generator never sees an adjustment, so
       removing one returns exactly the plan it was never in. */
    const { plan, stranded } = applyAdjustments(
      buildPlanForGoal(goal, mountain, new Date(), shape),
      livePlanAdjustments(adjustments, goal.id),
    );
    const activityDays = byDate(feed);

    const completedByDate = new Map<string, boolean>();
    const satisfiedByActivity = new Set<string>();

    for (const w of plan.weeks) {
      for (const d of w.days) {
        const acts = activityDays.get(d.date) ?? [];
        const auto = activitySatisfies(d, acts);
        if (auto) satisfiedByActivity.add(d.date);
        // A manual tick always wins; otherwise a real activity counts, and
        // failing both we fall back to the athlete's seeded history.
        completedByDate.set(d.date, isSessionComplete(w.index, d.date, auto || d.completed));
      }
    }

    const preparation = computePreparation(goal, plan, completedByDate, feed, mountain);
    const todayKey = isoDate(new Date());
    const today = plan.weeks.flatMap((w) => w.days).find((d) => d.date === todayKey);

    return {
      plan,
      goal,
      mountain,
      completedByDate,
      satisfiedByActivity,
      preparation,
      today,
      currentWeek: plan.weeks.find((w) => w.index === plan.currentWeek) ?? plan.weeks[0],
      strandedAdjustments: stranded,
    };
  }, [goal, feed, isSessionComplete, shape, adjustments]);
}

/** Goals with derived preparation, for anywhere a goal is rendered. */
export function useGoalsWithProgress(): Goal[] {
  const { goals } = useApp();
  const feed = useActivityFeed();
  const { isSessionComplete } = useApp();
  const shape = useTrainingShape();
  const adjustments = useAdjustments();

  return useMemo(
    () =>
      goals.map((goal) => {
        if (goal.status === "completed") return { ...goal, preparation: 100 };
        const mountain = goal.mountainId ? sync.mountainById(goal.mountainId) : undefined;
        /* THE SAME PLAN THE PLAN SCREEN SHOWS. Deriving preparation from the
           unadjusted baseline here would have every objective card disagree
           with the calendar it links to — an athlete who eased a week would
           see a readiness figure computed against work nobody is asking them
           to do any more. */
        const { plan } = applyAdjustments(
          buildPlanForGoal(goal, mountain, new Date(), shape),
          livePlanAdjustments(adjustments, goal.id),
        );
        const activityDays = byDate(feed);
        const completedByDate = new Map<string, boolean>();
        for (const w of plan.weeks) {
          for (const d of w.days) {
            const auto = activitySatisfies(d, activityDays.get(d.date) ?? []);
            completedByDate.set(d.date, isSessionComplete(w.index, d.date, auto || d.completed));
          }
        }
        return {
          ...goal,
          preparation: computePreparation(goal, plan, completedByDate, feed, mountain).percent,
        };
      }),
    [goals, feed, isSessionComplete, shape, adjustments],
  );
}

export function usePrimaryGoalWithProgress(): Goal | undefined {
  const goals = useGoalsWithProgress();
  return useMemo(
    () =>
      goals
        .filter((g) => g.status === "active")
        .sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate))[0],
    [goals],
  );
}
