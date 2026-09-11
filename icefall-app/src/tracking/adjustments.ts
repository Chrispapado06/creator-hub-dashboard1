import { useCallback, useEffect, useState } from "react";

import type { Difficulty, TrainingDay, TrainingDayAdjustment, TrainingPlan } from "@/types";

/**
 * THE PLAN BECOMES SOMETHING THAT CAN BE CHANGED — AND REMEMBERED.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 *
 * `buildPlanForGoal` is a pure function of the objective, the clock and the
 * athlete's own week. Every screen that shows the plan calls it again and gets
 * the plan back from first principles. Nothing persists it. The only stored
 * thing near it is `sessionOverrides`, a `Record<string, boolean>` that says
 * "this day was ticked" and nothing else.
 *
 * So there was nowhere — not one field — for anybody to write "I moved your
 * long day to Sunday". A coach could say it in a chat bubble and the plan
 * screen would still show Saturday, which is the worst of both: the athlete has
 * been told a change was made and can go and see that it was not.
 *
 * ============================================================================
 * THE SHAPE OF THE FIX: A LAYER OVER THE GENERATOR, NOT A REPLACEMENT FOR IT
 * ============================================================================
 *
 *     plan shown  =  buildPlanForGoal(...)  +  the adjustments on top
 *
 * `buildPlanForGoal` STAYS PURE AND STAYS THE BASELINE. It is not given a
 * store, it is not given an id to look things up by, and it does not know this
 * module exists. Everything here takes a finished plan and returns a different
 * finished plan.
 *
 * That buys three properties, and they are the whole reason for the shape:
 *
 *   1. DETERMINISM. The same baseline and the same adjustments always produce
 *      the same plan — see `applyAdjustments`, which reads no clock, no store,
 *      no locale and no random source, and applies records in a total order.
 *      A plan that drifts is a plan nobody can reason about, least of all the
 *      person training to it.
 *
 *   2. UNDO IS A DELETION, NOT AN INVERSE EDIT. Because the plan is recomputed
 *      from baseline + records on every render, removing a record from the
 *      applied set returns EXACTLY the plan that record was never in. There is
 *      no "move it back" operation to get subtly wrong, and no accumulation of
 *      edit and counter-edit. This is the property that makes the roadmap's
 *      Undo button honest rather than approximate.
 *
 *   3. A HISTORY THAT IS THE TRUTH RATHER THAN A LOG BESIDE IT. The records
 *      are not a description of what happened to the plan; they ARE what
 *      happened to the plan. A history screen built from them cannot fall out
 *      of step with the calendar, because the calendar is built from them.
 *
 * ============================================================================
 * WHAT A DAY IS IDENTIFIED BY — AND THE TRAP THAT DECIDED IT
 * ============================================================================
 *
 * BY ITS CALENDAR DATE, inside its goal. Never by a week index.
 *
 * `sessionOverrides` is keyed `${weekIndex}:${isoDate}`, and that key does not
 * survive the plan being rebuilt. Week indices are assigned by
 * `buildPlanForGoal` from `startOfWeek(goal.trainingStartedAt ?? now)`, and the
 * number of weeks comes from the gap to `goal.targetDate`. Move the target
 * date — one of the very tools Phase 2 is here to build — and `blockFor(w,
 * totalWeeks)` hands week 6 a different block than it had a minute ago. An
 * adjustment keyed on a week index would then land on a day nobody pointed at,
 * silently, with no error and nothing on screen to say so.
 *
 * A CALENDAR DATE IS A FACT ABOUT THE WORLD RATHER THAN ABOUT THE GENERATOR.
 * Saturday 20 September is Saturday 20 September whatever the generator later
 * decides to call that week, so "move the session on the 20th to the 21st"
 * still means the same thing after the objective moves.
 *
 * WHAT THAT COSTS, SAID RATHER THAN GLOSSED: if the baseline changes so much
 * that the 20th is no longer in the plan at all — a training start date pushed
 * forward, a plan that has run past its end — the adjustment has nothing to
 * apply to. It is NOT thrown away and it is NOT silently ignored:
 * `applyAdjustments` returns it under `stranded`, and the history screen says
 * "no longer applies" beside it. An athlete who moved a session is entitled to
 * know the day it moved to has gone.
 *
 * The goal id scopes it, because two active objectives are two plans and the
 * same Tuesday exists in both.
 *
 * ============================================================================
 * WHERE THE RECORDS LIVE: THIS DEVICE, TODAY. STATED PLAINLY.
 * ============================================================================
 *
 * `localStorage`, key `icefall.plan.adjustments.v1`. The same answer, for the
 * same reasons, as `coach/conversations.ts` and `coach/notes.ts`:
 *
 *   · THE TABLE DOES NOT EXIST YET. The migration that would create it,
 *     `icefall-supabase/migrations/20260911180000_plan_adjustments.sql`, is a
 *     DRAFT and has NOT been applied. A client that upserted into a missing
 *     table would fail silently, and a silent failure in a persistence layer
 *     looks exactly like it working — right up until somebody changes phone.
 *     So this module does not try, and nothing anywhere claims it synced.
 *
 *   · THE PLAN IS ALREADY AN OFFLINE OBJECT. It is generated on the device
 *     from the goal, the date and three signup answers, all of which are on the
 *     device. An adjustment layer that needed the network to render would make
 *     the training plan unavailable on exactly the mountain the plan is for.
 *
 * Consequences, which belong on the screen and not buried here: a new phone
 * opens on the unadjusted plan, and "Erase all data" in Settings takes these
 * with it, because that button clears by the `icefall.` prefix and this key is
 * under it.
 *
 * NOT SCOPED TO AN ACCOUNT, consistently with every other store in ICEFALL —
 * `icefall.state.v1` holds the goals themselves unscoped. Scoping the changes
 * to a plan while the plan's own objective stays unscoped would be a
 * reassurance the device cannot honour, and a worse one than making no
 * promise: the second person on a shared phone would see the first person's
 * objective with their own adjustments stripped off it.
 *
 * ── WHEN IT DOES SYNC, IT USES THE RULES `settings/hydrate.ts` ALREADY HAS ──
 *
 * Those rules are written for a scalar profile field, so half of them carry
 * over unchanged and half have to be READ RATHER THAN COPIED. Both halves, so
 * whoever writes the sync is not inventing a second merge:
 *
 *   · RULE 1 CARRIES OVER WHOLE. A record this device is holding unsent wins,
 *     and stays queued. Nothing about a set of records changes that.
 *
 *   · RULE 2 DOES NOT APPLY AND MUST NOT BE COPIED. "The server wins" is a
 *     sentence about ONE VALUE with two candidate contents. These are records
 *     with ids: the server and the device do not hold two versions of an
 *     adjustment, they hold two SETS, and the answer is the union rather than
 *     a winner. There is no field here for a server to correct.
 *
 *   · RULE 3 IS THE ONE THAT DECIDES THE SHAPE, and it generalises exactly: a
 *     fetch fills and corrects, it never empties. On a set that means the union
 *     of both sides and never a deletion — a device can prove a record exists
 *     and can never prove one was deleted rather than never received.
 *
 * WHICH IS WHY UNDO STAMPS `undoneAt` RATHER THAN SPLICING THE ARRAY. Under a
 * plain union, a hard delete is indistinguishable from "this phone has not seen
 * that one yet", so the next fetch would resurrect every undone change — the
 * long day the athlete moved off Saturday reappearing on Saturday, weeks later,
 * with no explanation. `undoneAt` makes the undo a fact that travels: it only
 * ever goes from unset to set, so a union where any side's stamp wins converges
 * without a tie-break, a clock comparison or a per-field rule.
 *
 * THE RECORD IS STILL GENUINELY GONE FROM THE PLAN. `applyAdjustments` never
 * sees an undone record — `livePlanAdjustments` filters them out before the
 * applier is called. Undo removes a record from the applied set; it does not
 * add an opposite one. The stamped row survives only so the history screen can
 * say "you undid this" and so the merge above can converge, and `forget` exists
 * for the day somebody wants it gone for good.
 *
 * ============================================================================
 * RULE 1: THE AI DECIDES, THE APP'S ENGINES DO THE WORK
 * ============================================================================
 *
 * THE VOCABULARY BELOW IS DELIBERATELY SMALL AND CARRIES NO PRESCRIPTION.
 * There is no `PlanChange` that contains a title, a distance, an elevation or
 * a session of any kind. A model cannot write "Saturday: 22 km, 1,400 m"
 * through this layer, because there is no field it would go in. It can choose
 * MOVE, REST, SHORTEN or EASE and point at a day; every number the athlete then
 * reads is computed here, from the baseline the generator produced.
 *
 * `shorten` takes minutes, and that is the one number in the vocabulary. It is
 * the athlete's time budget — "I only have 45 minutes on Thursday" — not a
 * prescription, and it can only ever make a session shorter than the generator
 * made it (a `shorten` that lengthens is refused and returns stranded).
 *
 * `why` is free text, and it IS shown. It is a reason, not a prescription, and
 * it is labelled with who said it: `by: "coach"` renders as the coach's words,
 * `by: "athlete"` as the athlete's own. It never becomes part of a session.
 *
 * NOTHING IN THIS VOCABULARY CAN MAKE A DAY HARDER, which is not an accident —
 * it is where the roadmap's "a day readiness has downgraded can never be made
 * harder" guardrail gets most of its strength for free. The one exception is
 * `move`, which can put a long day onto a date that was rest, and that is a
 * decision for the tool layer to refuse rather than for this applier to
 * second-guess: an applier that dropped changes it disapproved of would make
 * the plan disagree with the history, which is the failure this whole file
 * exists to prevent.
 *
 * SAFETY IS NOT HERE AND MUST NOT MOVE HERE. `coach/safety.ts` runs first, on
 * the athlete's words, before any of this. A tool path is still a path, and
 * nothing in this module is a place to re-implement or shortcut it.
 */

/* -------------------------------------------------------------------------- */
/* The record                                                                  */
/* -------------------------------------------------------------------------- */

/** Who made the change. Shown to the athlete; never inferred. */
export type AdjustmentAuthor = "athlete" | "coach";

/**
 * What changed, as a closed vocabulary of ACTIONS.
 *
 * Adding a kind here is a deliberate act with a cost: every kind must be
 * applicable to a `TrainingDay` by this file's own arithmetic, describable in
 * one past-tense line by `describeChange`, and impossible to use to smuggle a
 * prescription in. "Replace this day with a session I have written" fails all
 * three and is not going to appear here.
 */
export type PlanChange =
  /**
   * This day's session goes to `to`.
   *
   * MOVE AND SWAP ARE ONE OPERATION, not two. If `to` already carries a
   * session the two days EXCHANGE, because the alternative is deleting work
   * the athlete never asked to lose. The tool layer may call it a swap when it
   * knows both days are full; the record and the applier do not need to care.
   */
  | { kind: "move"; to: string }
  /** This day becomes rest. The session is not moved anywhere — it is dropped. */
  | { kind: "rest" }
  /**
   * Hold this day's session to `minutes`, scaling distance and vertical with
   * the time. Never lengthens; see `MIN_SHORTEN_MIN` for the floor.
   */
  | { kind: "shorten"; minutes: number }
  /** One or two notches easier: less of the same work, at a lower difficulty. */
  | { kind: "ease"; notches: 1 | 2 };

export interface PlanAdjustment {
  /** Unique, and the thing Undo names. */
  id: string;
  /** The plan this belongs to — `TrainingPlan.goalId`. */
  goalId: string;
  /** ISO date (`YYYY-MM-DD`) of the day being changed. Never a week index. */
  date: string;
  change: PlanChange;
  /** Why, in words, shown to the athlete. Whose words is `by`. */
  why: string;
  /** ISO timestamp. Part of the total order the applier depends on. */
  at: string;
  by: AdjustmentAuthor;
  /**
   * Records made in one act — "reschedule the week" is six moves — share this.
   * Undo takes the batch, because undoing one sixth of a reschedule leaves a
   * week nobody chose.
   */
  batchId?: string;
  /**
   * Set when the change was undone. ONE-WAY: never cleared, which is what lets
   * a future sync merge by union without a tie-break. An undone record is not
   * applied to the plan — see the header.
   */
  undoneAt?: string;
}

/* -------------------------------------------------------------------------- */
/* The coaching constants                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One notch easier, as a fraction of the volume the generator asked for.
 *
 * A COACHING JUDGEMENT, like `BASELINE_LOAD` in `training.ts`, and it is never
 * printed as a measurement. Two notches compound to 0.64 rather than 0.6,
 * which is the honest arithmetic of doing it twice and not a second constant
 * somebody has to keep in step with this one.
 */
const EASE_STEP = 0.8;

/**
 * The shortest a session may be cut to.
 *
 * Below this it is not a shortened session, it is a different thing with the
 * old title on it — and the scaled distance printed underneath would be a
 * figure nobody prescribed. A request under this floor is refused outright
 * rather than clamped, so the athlete is told rather than quietly given
 * something they did not ask for.
 */
const MIN_SHORTEN_MIN = 15;

/** Longest reason kept. Longer is a client that has stopped agreeing with us. */
export const MAX_WHY_CHARS = 240;

/* -------------------------------------------------------------------------- */
/* The applier — PURE. No clock, no store, no locale, no randomness.           */
/* -------------------------------------------------------------------------- */

/**
 * Proportional rescale of a session to a new duration.
 *
 * EXPORTED SO THERE IS ONE RULE AND NOT TWO. `capped()` in `training.ts` holds
 * a session to the length the athlete called normal and does this arithmetic;
 * `shorten` here holds one to the time they have on the day and needs the same
 * arithmetic to the digit. Two copies would disagree the first time either is
 * tuned, and the athlete would see one number on the plan screen and another on
 * the session screen.
 *
 * Distance and vertical scale WITH the time rather than standing still: 12 km
 * inside 30 minutes is not a shortened session, it is an impossible one.
 */
export function rescaleToMinutes<
  T extends { durationMin?: number; distanceKm?: number; elevationM?: number },
>(day: T, minutes: number): T {
  if (!day.durationMin || day.durationMin <= minutes) return day;
  const ratio = minutes / day.durationMin;
  return {
    ...day,
    durationMin: minutes,
    distanceKm:
      day.distanceKm === undefined
        ? undefined
        : Math.max(0.5, Math.round(day.distanceKm * ratio * 10) / 10),
    elevationM:
      day.elevationM === undefined ? undefined : Math.max(10, Math.round(day.elevationM * ratio)),
  };
}

/** Scale every volume figure a day carries by one factor. Difficulty is separate. */
function scaleVolume(day: TrainingDay, factor: number): TrainingDay {
  return {
    ...day,
    durationMin:
      day.durationMin === undefined
        ? undefined
        : Math.max(10, Math.round(day.durationMin * factor)),
    distanceKm:
      day.distanceKm === undefined
        ? undefined
        : Math.max(0.5, Math.round(day.distanceKm * factor * 10) / 10),
    elevationM:
      day.elevationM === undefined ? undefined : Math.max(10, Math.round(day.elevationM * factor)),
  };
}

/** The session half of a day — all of it except which date it is and whether it was done. */
type Session = Omit<TrainingDay, "date" | "completed" | "adjusted">;

function sessionOf(day: TrainingDay): Session {
  return {
    focus: day.focus,
    title: day.title,
    detail: day.detail,
    distanceKm: day.distanceKm,
    elevationM: day.elevationM,
    durationMin: day.durationMin,
    difficulty: day.difficulty,
  };
}

/**
 * The rest day a `rest` adjustment produces, and the one a `move` leaves
 * behind. Worded exactly like the generator's own `FULL_REST`, so a day the
 * athlete cleared does not read as a different KIND of rest from a day the plan
 * chose — the difference between the two is the reason beside it, which the
 * history carries, and not a second vocabulary of rest.
 */
const RESTED: Session = {
  focus: "rest",
  title: "Rest",
  detail: "Full rest. Adaptation happens here.",
  difficulty: 1,
  /*
   * THE THREE `undefined`s ARE LOAD-BEARING AND WERE MISSING — fixed
   * 2026-09-11 while building the coach's tools on top of this layer.
   *
   * Every use of this constant is a SPREAD over the day being replaced:
   * `{ ...day, ...RESTED }`. A key that is not present here does not overwrite,
   * so without these three a day turned into rest kept the volume figures of
   * the session it replaced — the plan held a rest day carrying 262 minutes,
   * 16 km and 1,047 m of ascent. `describeDay` never printed them because it
   * returns early on a rest day, which is exactly why this survived being
   * looked at: it was invisible on the screens and wrong in the data. Anything
   * that SUMS a week's prescribed minutes saw a week that had not lost the
   * session it had just lost, and the coach's confirmation threshold is
   * measured on precisely that sum.
   *
   * `sessionOf` above lists every key for the same reason. An optional field in
   * a spread is only cleared by being named.
   */
  distanceKm: undefined,
  elevationM: undefined,
  durationMin: undefined,
};

const en = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/**
 * A date as the athlete reads it. Locale is PINNED rather than taken from the
 * device, because this string is part of a pure function's output and a plan
 * that reads differently on two phones is a plan that drifts. The app interface
 * is English by the roadmap's own decision; coach REPLIES are the thing that
 * follow the athlete's language, and they are not written here.
 */
export function readableDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return en.format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * One past-tense line describing a record, in the app's own words.
 *
 * NOT THE MODEL'S. Rule 1: whatever a coach said in chat, what the plan screen
 * and the history screen show is derived from the record by this function. The
 * model's sentence is `why`, and it is shown beside this one, attributed.
 */
export function describeChange(a: PlanAdjustment): string {
  switch (a.change.kind) {
    case "move":
      return `Moved to ${readableDay(a.change.to)}`;
    case "rest":
      return "Made a rest day";
    case "shorten":
      return `Cut to ${Math.round(a.change.minutes)} min`;
    case "ease":
      return a.change.notches === 1 ? "Eased one notch" : "Eased two notches";
  }
}

/** A record the plan could not take, and the reason, in the app's own words. */
export interface StrandedAdjustment {
  adjustment: PlanAdjustment;
  reason: string;
}

export interface AdjustedPlan {
  /** The baseline with every applicable record applied, in order. */
  plan: TrainingPlan;
  /** Records that did apply, in the order they were applied. */
  applied: PlanAdjustment[];
  /**
   * Records that could not apply.
   *
   * NOT AN ERROR CHANNEL TO SWALLOW. A stranded record is a change the athlete
   * was told had been made and that the plan no longer shows, and the history
   * screen is required to say so beside it.
   */
  stranded: StrandedAdjustment[];
}

/**
 * The baseline plus the records. PURE — give it the same two arguments and it
 * returns the same plan, on any device, in any timezone, at any hour.
 *
 * ORDER IS TOTAL AND EXPLICIT: `at` then `id`. Records that stack on one day —
 * eased on Monday, then shortened on Wednesday, then moved — must compose the
 * same way every time, and a sort that can tie is a sort that lets two runs
 * disagree. `id` breaks every tie `at` can produce because it is unique.
 *
 * The caller filters: pass only this goal's live records. `livePlanAdjustments`
 * is that filter and it is the only one — an undone record never reaches here.
 */
export function applyAdjustments(
  plan: TrainingPlan,
  adjustments: readonly PlanAdjustment[],
): AdjustedPlan {
  const ordered = [...adjustments].sort((a, b) =>
    a.at === b.at ? (a.id < b.id ? -1 : 1) : a.at < b.at ? -1 : 1,
  );

  /* One mutable index by date. Every operation below is expressed on dates,
     because a week index is the thing that does not survive a rebuild. */
  const byDate = new Map<string, TrainingDay>();
  for (const w of plan.weeks) for (const d of w.days) byDate.set(d.date, { ...d });

  const applied: PlanAdjustment[] = [];
  const stranded: StrandedAdjustment[] = [];
  const strand = (adjustment: PlanAdjustment, reason: string) =>
    stranded.push({ adjustment, reason });

  const mark = (day: TrainingDay, a: PlanAdjustment, summary: string): TrainingDay => {
    const entry: TrainingDayAdjustment = { id: a.id, by: a.by, why: a.why, at: a.at, summary };
    return { ...day, adjusted: [...(day.adjusted ?? []), entry] };
  };

  for (const a of ordered) {
    const day = byDate.get(a.date);
    if (!day) {
      strand(a, "That day is no longer in this plan.");
      continue;
    }

    switch (a.change.kind) {
      case "move": {
        const target = byDate.get(a.change.to);
        if (!target) {
          strand(a, "The day it moved to is no longer in this plan.");
          continue;
        }
        if (a.change.to === a.date) {
          strand(a, "A day cannot move to itself.");
          continue;
        }
        if (day.focus === "rest") {
          strand(a, "That day no longer has a session to move.");
          continue;
        }
        /* The exchange. `date` and `completed` stay with the DATE and never
           travel with the session: a day the athlete actually trained stays
           trained, whatever the plan later says was scheduled on it. */
        const here = sessionOf(day);
        const movedBack = target.focus === "rest" ? RESTED : sessionOf(target);
        byDate.set(
          a.date,
          mark({ ...day, ...movedBack }, a, `Moved to ${readableDay(a.change.to)}`),
        );
        byDate.set(
          a.change.to,
          mark({ ...target, ...here }, a, `Moved from ${readableDay(a.date)}`),
        );
        applied.push(a);
        break;
      }

      case "rest": {
        if (day.focus === "rest") {
          strand(a, "That day is already a rest day.");
          continue;
        }
        byDate.set(a.date, mark({ ...day, ...RESTED }, a, "Made a rest day"));
        applied.push(a);
        break;
      }

      case "shorten": {
        const minutes = Math.round(a.change.minutes);
        if (day.focus === "rest") {
          strand(a, "That day is a rest day — there is nothing to shorten.");
          continue;
        }
        if (minutes < MIN_SHORTEN_MIN) {
          strand(a, `Shorter than ${MIN_SHORTEN_MIN} min is not a shortened session.`);
          continue;
        }
        if (!day.durationMin || day.durationMin <= minutes) {
          strand(a, "The session is already that short or shorter.");
          continue;
        }
        const cut = rescaleToMinutes(day, minutes);
        byDate.set(
          a.date,
          mark(
            {
              ...cut,
              detail: cut.detail
                ? `${cut.detail}. Cut to the ${minutes} min you had.`
                : `Cut to the ${minutes} min you had.`,
            },
            a,
            `Cut to ${minutes} min`,
          ),
        );
        applied.push(a);
        break;
      }

      case "ease": {
        if (day.focus === "rest") {
          strand(a, "That day is a rest day — there is nothing to ease.");
          continue;
        }
        const notches = a.change.notches;
        const eased = scaleVolume(day, EASE_STEP ** notches);
        const difficulty = Math.max(1, day.difficulty - notches) as Difficulty;
        /* The original prose is KEPT and a sentence added, rather than
           replaced. The generator's detail says what KIND of work this is —
           "Crampon and axe work", "6 × 4 min hard uphill" — and that is still
           true of an easier version of it. What is no longer true is how much,
           and the volume figures beside it have already been changed to say so.
           A detail rewritten from scratch here would throw away the only
           description of the session the plan has. */
        const line =
          notches === 1
            ? "Eased one notch — hold the effort, take the volume off."
            : "Eased two notches — hold the effort, take the volume off.";
        byDate.set(
          a.date,
          mark(
            { ...eased, difficulty, detail: eased.detail ? `${eased.detail}. ${line}` : line },
            a,
            notches === 1 ? "Eased one notch" : "Eased two notches",
          ),
        );
        applied.push(a);
        break;
      }
    }
  }

  return {
    plan: {
      ...plan,
      weeks: plan.weeks.map((w) => ({
        ...w,
        days: w.days.map((d) => byDate.get(d.date) ?? d),
      })),
    },
    applied,
    stranded,
  };
}

/**
 * This goal's records, undone ones removed, ready for the applier.
 *
 * THE ONLY PLACE `undoneAt` IS READ ON THE WAY INTO A PLAN. Keeping the filter
 * here rather than inside `applyAdjustments` means the applier has one job, and
 * a caller that wants to show "what this would look like again" can hand the
 * undone record straight back to it without a second code path.
 */
export function livePlanAdjustments(
  all: readonly PlanAdjustment[],
  goalId: string,
): PlanAdjustment[] {
  return all.filter((a) => a.goalId === goalId && !a.undoneAt);
}

/* -------------------------------------------------------------------------- */
/* The store — this device                                                     */
/* -------------------------------------------------------------------------- */

const KEY = "icefall.plan.adjustments.v1";

/**
 * How many records are kept per objective, oldest dropped first.
 *
 * A plan runs at most 52 weeks; two hundred changes is several a week for the
 * whole of it, and comfortably more than anybody will make. The cap exists
 * because `localStorage` is a hard 5 MB shared with every other `icefall.` key,
 * and a Coach that ate the quota would break the food log and the recorded
 * activities — a far worse failure than losing the oldest entry in a history.
 */
const MAX_PER_GOAL = 200;

/** Checked on the serialised string, because the count alone does not bound bytes. */
const MAX_BYTES = 200_000;

interface Stored {
  adjustments: PlanAdjustment[];
}

const EMPTY: Stored = { adjustments: [] };

function isChange(v: unknown): v is PlanChange {
  if (!v || typeof v !== "object") return false;
  const c = v as { kind?: unknown; to?: unknown; minutes?: unknown; notches?: unknown };
  if (c.kind === "move") return typeof c.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.to);
  if (c.kind === "rest") return true;
  if (c.kind === "shorten") return typeof c.minutes === "number" && Number.isFinite(c.minutes);
  if (c.kind === "ease") return c.notches === 1 || c.notches === 2;
  return false;
}

/**
 * Every field re-validated rather than trusted.
 *
 * A stored record with a `kind` this build does not know about would fall
 * through the applier's switch and change nothing while still showing in the
 * history as though it had — the plan and the history disagreeing, which is the
 * one failure this file cannot allow. Refusing it at the door means the history
 * shows only changes that were actually made.
 */
function isAdjustment(v: unknown): v is PlanAdjustment {
  if (!v || typeof v !== "object") return false;
  const a = v as Partial<PlanAdjustment>;
  return (
    typeof a.id === "string" &&
    typeof a.goalId === "string" &&
    typeof a.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(a.date) &&
    typeof a.why === "string" &&
    typeof a.at === "string" &&
    (a.by === "athlete" || a.by === "coach") &&
    isChange(a.change)
  );
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    /* A half-written record is an empty one. This is read while the plan screen
       mounts; it must never throw the athlete onto a blank app. */
    return {
      adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments.filter(isAdjustment) : [],
    };
  } catch {
    return EMPTY;
  }
}

/**
 * One subscriber list, so the plan screen and the history screen cannot
 * disagree — undoing a change on the history screen has to redraw the calendar
 * behind it, not leave a session on a day it is no longer on.
 */
const listeners = new Set<(s: Stored) => void>();
let current: Stored = typeof localStorage === "undefined" ? EMPTY : read();

/** Oldest first, capped per goal, and small enough to store. */
function fit(adjustments: PlanAdjustment[]): PlanAdjustment[] {
  const perGoal = new Map<string, PlanAdjustment[]>();
  for (const a of adjustments) {
    const list = perGoal.get(a.goalId) ?? [];
    list.push(a);
    perGoal.set(a.goalId, list);
  }
  let kept = [...perGoal.values()].flatMap((list) =>
    list.length > MAX_PER_GOAL ? list.slice(-MAX_PER_GOAL) : list,
  );
  kept.sort((a, b) => (a.at === b.at ? (a.id < b.id ? -1 : 1) : a.at < b.at ? -1 : 1));
  /* Guard the pathological case rather than trusting the count: drop from the
     oldest end until the record fits. `why` is free text up to 240 characters
     each, so a count alone does not bound the bytes. */
  while (kept.length > 1 && JSON.stringify(kept).length > MAX_BYTES) {
    kept = kept.slice(1);
  }
  return kept;
}

function write(next: Stored) {
  current = { adjustments: fit(next.adjustments) };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* Private mode or a full quota. The change holds for this session and is
       gone on the next launch. Nothing here may pretend it was kept — that is
       what the plan screen's "kept on this device" line is for. */
  }
  listeners.forEach((l) => l(current));
}

let seq = 0;
/** Unique within a session even when two records are made in the same millisecond. */
function newId(): string {
  seq += 1;
  return `adj-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

export function currentAdjustments(): readonly PlanAdjustment[] {
  return current.adjustments;
}

export interface NewAdjustment {
  goalId: string;
  date: string;
  change: PlanChange;
  why: string;
  by: AdjustmentAuthor;
}

/**
 * Record one change. Returns it, so the caller can show a before/after and
 * offer Undo against a definite id rather than "the last one".
 */
export function addAdjustment(a: NewAdjustment): PlanAdjustment {
  return addAdjustments([a])[0];
}

/**
 * Record several changes as ONE act.
 *
 * TAKES AN ARRAY BECAUSE A RESCHEDULE IS NOT SIX DECISIONS. "Push the week back
 * a day" is six moves the athlete agreed to once, and six separate calls would
 * each read `current`, so the second would overwrite the first. They also have
 * to undo together: a week with five sixths of a reschedule applied is a week
 * nobody chose.
 */
export function addAdjustments(batch: readonly NewAdjustment[]): PlanAdjustment[] {
  if (batch.length === 0) return [];
  const at = new Date().toISOString();
  const batchId = batch.length > 1 ? newId() : undefined;
  const made: PlanAdjustment[] = batch.map((a) => ({
    id: newId(),
    goalId: a.goalId,
    date: a.date,
    change: a.change,
    why: a.why.trim().slice(0, MAX_WHY_CHARS),
    at,
    by: a.by,
    batchId,
  }));
  write({ adjustments: [...current.adjustments, ...made] });
  return made;
}

/**
 * Undo. Takes the record out of the applied set — and takes its whole batch
 * with it, because a reschedule is one decision.
 *
 * See the header for why this stamps rather than splices.
 */
export function undoAdjustment(id: string): void {
  const target = current.adjustments.find((a) => a.id === id);
  if (!target || target.undoneAt) return;
  const at = new Date().toISOString();
  write({
    adjustments: current.adjustments.map((a) => {
      const inBatch = target.batchId !== undefined && a.batchId === target.batchId;
      if (a.id !== id && !inBatch) return a;
      return a.undoneAt ? a : { ...a, undoneAt: at };
    }),
  });
}

/** Remove a record outright, history and all. For an erase, not for an undo. */
export function forgetAdjustment(id: string): void {
  write({ adjustments: current.adjustments.filter((a) => a.id !== id) });
}

/** Every change to one objective's plan gone. For a goal that is deleted. */
export function clearAdjustmentsForGoal(goalId: string): void {
  write({ adjustments: current.adjustments.filter((a) => a.goalId !== goalId) });
}

export function clearAdjustments(): void {
  write(EMPTY);
}

function useStore(): Stored {
  const [state, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

/** Everything stored, for the caller that needs more than one goal. */
export function useAdjustments(): readonly PlanAdjustment[] {
  return useStore().adjustments;
}

/**
 * One act, as the history screen shows it: what changed, when, why, by whom,
 * and whether it still stands.
 */
export interface PlanChangeEntry {
  /** The record Undo names — the first of the batch, or the lone record. */
  id: string;
  at: string;
  by: AdjustmentAuthor;
  why: string;
  undoneAt?: string;
  /** Every record made in this act, earliest day first. */
  adjustments: PlanAdjustment[];
}

/**
 * Group records into the acts that made them, newest act first.
 *
 * Pure and exported so the history screen has nothing to work out for itself,
 * and so the grouping can be tested without a React tree.
 */
export function planChangeHistory(
  all: readonly PlanAdjustment[],
  goalId: string,
): PlanChangeEntry[] {
  const acts = new Map<string, PlanAdjustment[]>();
  for (const a of all) {
    if (a.goalId !== goalId) continue;
    const key = a.batchId ?? a.id;
    acts.set(key, [...(acts.get(key) ?? []), a]);
  }
  return [...acts.values()]
    .map((list) => {
      const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const head = sorted[0];
      return {
        id: head.id,
        at: head.at,
        by: head.by,
        why: head.why,
        undoneAt: head.undoneAt,
        adjustments: sorted,
      };
    })
    .sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1));
}

/** The history screen's hook. Re-renders when anything changes the set. */
export function usePlanChangeHistory(goalId: string | undefined): {
  entries: PlanChangeEntry[];
  undo: (id: string) => void;
} {
  const all = useAdjustments();
  return {
    entries: goalId ? planChangeHistory(all, goalId) : [],
    undo: useCallback(undoAdjustment, []),
  };
}
