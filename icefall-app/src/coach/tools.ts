/**
 * THE CLOSED VOCABULARY OF THINGS A MODEL MAY ASK THE APP TO DO.
 *
 * ============================================================================
 * RULE 1, WRITTEN AS A TYPE
 * ============================================================================
 *
 * "The AI decides; the app's engines do the work." Every field below is a
 * CHOICE — which day, which direction, how many minutes the athlete said they
 * had. There is nowhere in any of these shapes to put a session title, a
 * distance, an ascent, a difficulty or a description. A model that wanted to
 * hand the athlete a workout it had written could not express it here, and a
 * model that wanted to describe a change it had not caused could not get that
 * description onto the screen either: what the athlete reads is rendered by
 * `planActions.ts` from the generator's own output, before and after.
 *
 * The single exception is `why`, and it is deliberate rather than a leak. The
 * adjustment layer already stores a reason and attributes it — "…" — your
 * coach. A reason is the one thing in a coaching change that the model is
 * genuinely the author of, and the athlete is entitled to see whose sentence it
 * is. It is capped, stripped of formatting, and it sits BESIDE the figures
 * rather than supplying any of them, so a `why` that said something untrue
 * would be contradicted on its own row by the numbers next to it.
 *
 * `log_activity` LOOKS LIKE AN EXCEPTION AND IS NOT. Its numbers are the
 * athlete's own — "I did about two hours with 600 up this morning" — and the
 * model's job there is transcription, not prescription. It is the reason that
 * tool always asks for a tap before it writes, always records the result as
 * self-reported, and never lets it stand as a personal best. See
 * `tracking/manual.ts`.
 *
 * ============================================================================
 * WHERE THIS FILE SITS IN THE TRUST CHAIN
 * ============================================================================
 *
 *   the model  ->  the edge function  ->  THIS FILE  ->  planActions -> engines
 *
 * The edge function declares these tools to the API and passes the model's
 * choice back untouched. It does not apply anything: the plan is generated on
 * the phone and the adjustment records live on the phone, so the server has
 * nothing to apply it to even if it wanted to.
 *
 * `parseCoachAction` is therefore the real boundary, and it is written as if
 * the server were hostile — because the interesting failure is not a malicious
 * server, it is a model that returns `{"date": "next Tuesday"}` or a schema
 * that drifted a field name during a deploy. Anything that does not match
 * exactly is refused, and the athlete is told the coach asked for something the
 * app could not read. Refusing is always safe; guessing is not.
 *
 * ============================================================================
 * KEEPING THE TWO SCHEMAS IN STEP
 * ============================================================================
 *
 * The names and arguments below are mirrored by hand in the edge function
 * (`icefall-supabase/supabase/functions/coach/index.ts`), because a Deno deploy
 * cannot import from this bundle.
 *
 * THE EDGE FUNCTION DECLARES ONE MORE TOOL THAN THIS FILE KNOWS: `suggest_routes`,
 * which draws trail and trek cards and changes nothing. It is parsed by
 * `coach/routeTools.ts` instead, deliberately — every member of `CoachAction`
 * below is handed to `planActions.ts`, and a member that meant "change nothing"
 * would put a do-nothing branch inside the function that rewrites somebody's
 * training. The two parsers refuse each other's names, so exactly one of them
 * can ever answer a given tool call.
 *
 * Note which way the drift can hurt. A tool the server declares and this file
 * does not know is REFUSED here, and the athlete sees "your coach asked for
 * something this version of the app cannot do". A tool this file knows and the
 * server never declares is simply never called. Neither one can cause a wrong
 * change to be applied — the failure mode of drift is a refusal, by
 * construction.
 */

import { parseLocalClock } from "@/tracking/timeOfDay";

/** Longest reason kept, matching `MAX_WHY_CHARS` in the adjustment layer. */
export const MAX_WHY_CHARS = 240;

export const COACH_TOOL_NAMES = [
  "log_activity",
  "shorten_session",
  "ease_session",
  "rest_day",
  "move_session",
  "swap_sessions",
  "reschedule_week",
  "set_target_date",
] as const;

export type CoachToolName = (typeof COACH_TOOL_NAMES)[number];

/**
 * `rest_day` IS THE EIGHTH TOOL AND THE ROADMAP LISTS SEVEN. It is here because
 * the adjustment layer's action vocabulary has four members — move, rest,
 * shorten, ease — and a tool layer that could reach only three of them would
 * force the model to approximate the fourth. Asked to give somebody the day
 * off, it would reach for `ease_session` with two notches, and the athlete who
 * was told to rest would open the plan and find a session at 64% volume. An
 * approximation of rest is not rest.
 */
export type CoachAction =
  | {
      tool: "log_activity";
      /** The day the athlete says they did it. */
      date: string;
      /**
       * The local clock time they say they started, `HH:MM`, or absent.
       *
       * TRANSCRIPTION, LIKE THE FIGURES BESIDE IT, AND NOT AN EXCEPTION TO
       * RULE 1. "I was out at half five" is the athlete's own statement of
       * their own morning; the model's job is to carry it across, exactly as
       * it carries "about two hours". What the model may NOT do is supply one
       * they did not give — and it cannot quietly do so unnoticed, because a
       * start nobody stated is recorded as INFERRED, shown as inferred on the
       * confirmation the athlete has to tap, and excluded from every
       * conclusion the coach draws about when this person trains
       * (`coach/timeOfDay.ts`).
       *
       * Absent is the normal case and costs nothing: the app places the session
       * itself and says that it did.
       */
      startTimeLocal?: string;
      /** An id from `ACTIVITY_TYPES`; checked against the catalogue downstream. */
      activityTypeId: string;
      durationMin: number;
      distanceKm?: number;
      ascentM?: number;
      why: string;
    }
  | { tool: "shorten_session"; date: string; minutes: number; why: string }
  | { tool: "ease_session"; date: string; notches: 1 | 2; why: string }
  | { tool: "rest_day"; date: string; why: string }
  | { tool: "move_session"; date: string; to: string; why: string }
  | { tool: "swap_sessions"; date: string; withDate: string; why: string }
  | {
      tool: "reschedule_week";
      /** The Monday of the week to shift. Matched against `TrainingWeek.startDate`. */
      weekStartDate: string;
      /** Whole days, negative earlier. Bounded — see `MAX_SHIFT_DAYS`. */
      byDays: number;
      why: string;
    }
  | { tool: "set_target_date"; date: string; why: string };

/**
 * How far a week may be shifted in one act.
 *
 * Three days each way. Beyond that the sessions are not being rescheduled, they
 * are being rebuilt against a different week of the block, and the honest tool
 * for that is the target date — which rebuilds the whole plan and says so.
 */
export const MAX_SHIFT_DAYS = 3;

/** A session may never be cut below this; the adjustment layer refuses it too. */
export const MIN_SESSION_MIN = 15;

/** Nothing this app will accept as a single session's length. */
const MAX_SESSION_MIN = 24 * 60;

/* -------------------------------------------------------------------------- */
/* Parsing — strict, total, and refusing rather than guessing                  */
/* -------------------------------------------------------------------------- */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar date, or null.
 *
 * REBUILT AND COMPARED rather than merely pattern-matched, because
 * `2026-02-31` matches the pattern perfectly and `new Date` rolls it forward to
 * March. A plan change aimed at a day that does not exist would land on a day
 * nobody named.
 */
function date(v: unknown): string | null {
  if (typeof v !== "string" || !DATE.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
    ? v
    : null;
}

/** A finite number in range, rounded to a whole. Rejects strings outright. */
function whole(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= min && n <= max ? n : null;
}

/** A finite non-negative measurement to one decimal, or null. Optional fields only. */
function measure(v: unknown, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) return null;
  return Math.round(v * 10) / 10;
}

/**
 * The model's reason, made safe to render.
 *
 * Markdown is stripped rather than escaped: the house rules allow the model
 * exactly one piece of formatting, `**bold**` around an action, and this string
 * is not rendered through the component that understands it — so asterisks here
 * would print as asterisks. Newlines collapse for the same reason: this is one
 * line beside a change, not a paragraph.
 */
export function cleanWhy(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_WHY_CHARS);
}

/**
 * The model's tool call, or null if it is not one this app can carry out.
 *
 * TOTAL AND EXHAUSTIVE. Every branch validates every field it will later use;
 * nothing is defaulted, because a default here is a decision the model did not
 * make being attributed to it.
 */
export function parseCoachAction(name: unknown, raw: unknown): CoachAction | null {
  if (typeof name !== "string") return null;
  if (!(COACH_TOOL_NAMES as readonly string[]).includes(name)) return null;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const a = raw as Record<string, unknown>;
  const why = cleanWhy(a.why);
  /* A change with no stated reason is refused. The history screen shows the
     reason beside every row and attributes it; a blank one would leave the
     athlete looking at a change to their training with nobody's name on why. */
  if (!why) return null;

  switch (name as CoachToolName) {
    case "log_activity": {
      const d = date(a.date);
      const durationMin = whole(a.durationMin, 1, MAX_SESSION_MIN);
      if (!d || durationMin === null) return null;
      if (typeof a.activityTypeId !== "string" || !a.activityTypeId) return null;
      const distanceKm = a.distanceKm === undefined ? undefined : measure(a.distanceKm, 500);
      const ascentM = a.ascentM === undefined ? undefined : measure(a.ascentM, 12_000);
      if (distanceKm === null || ascentM === null) return null;
      /* A start time that does not parse is DROPPED, not refused: the rest of
         the call is a session the athlete really did, and throwing it away over
         "half five" would lose their training to a formatting slip. What
         survives is a log with no stated time, which the app then places and
         labels as its own placement — the honest outcome either way. */
      const startTimeLocal =
        a.startTimeLocal !== undefined && parseLocalClock(a.startTimeLocal) !== null
          ? (a.startTimeLocal as string).trim()
          : undefined;
      return {
        tool: "log_activity",
        date: d,
        startTimeLocal,
        activityTypeId: a.activityTypeId,
        durationMin,
        distanceKm,
        ascentM,
        why,
      };
    }

    case "shorten_session": {
      const d = date(a.date);
      const minutes = whole(a.minutes, MIN_SESSION_MIN, MAX_SESSION_MIN);
      return d && minutes !== null ? { tool: "shorten_session", date: d, minutes, why } : null;
    }

    case "ease_session": {
      const d = date(a.date);
      const n = whole(a.notches, 1, 2);
      return d && n !== null
        ? { tool: "ease_session", date: d, notches: n === 2 ? 2 : 1, why }
        : null;
    }

    case "rest_day": {
      const d = date(a.date);
      return d ? { tool: "rest_day", date: d, why } : null;
    }

    case "move_session": {
      const d = date(a.date);
      const to = date(a.to);
      return d && to ? { tool: "move_session", date: d, to, why } : null;
    }

    case "swap_sessions": {
      const d = date(a.date);
      const withDate = date(a.withDate);
      return d && withDate ? { tool: "swap_sessions", date: d, withDate, why } : null;
    }

    case "reschedule_week": {
      const weekStartDate = date(a.weekStartDate);
      const byDays = whole(a.byDays, -MAX_SHIFT_DAYS, MAX_SHIFT_DAYS);
      /* Zero is not a shift. It would write a batch of records that change
         nothing and sit in the history as a decision somebody took. */
      return weekStartDate && byDays !== null && byDays !== 0
        ? { tool: "reschedule_week", weekStartDate, byDays, why }
        : null;
    }

    case "set_target_date": {
      const d = date(a.date);
      return d ? { tool: "set_target_date", date: d, why } : null;
    }
  }
}
