import { useCallback, useEffect, useMemo, useState } from "react";

import { useCoachIntel } from "@/coach/hooks";
import {
  buildWeeklyReview,
  type ReviewActivity,
  type ReviewProposal,
  type WeeklyReview,
} from "@/coach/weeklyReview";
import { isoDate } from "@/data/mock/clock";
import { useApp } from "@/state/AppState";
import { useAdjustments, livePlanAdjustments } from "@/tracking/adjustments";
import { useActivityFeed } from "@/tracking/feed";
import { useTraining } from "@/tracking/training";

/**
 * THE REVIEW, BOUND TO WHAT THE ATHLETE ACTUALLY HAS — AND THE ONE FACT THE
 * ENGINE CANNOT DERIVE: WHETHER THEY HAVE SEEN IT.
 *
 * ============================================================================
 * "COMPUTED WHEN YOU OPENED ICEFALL" IS A CLAIM, SO IT IS MEASURED
 * ============================================================================
 *
 * `OPENED_AT` is stamped once, when this module is first imported — which is
 * when a Coach screen first loads in this session. Every review built in the
 * session carries that instant, and the screen prints it, wording it as
 * "when you opened Coach" rather than "when you opened the app", because that
 * is the event this stamp actually marks. A `new Date()` inside
 * the memo would have re-stamped on every dependency change and the screen
 * would have shown a time that crept forward while nothing was recomputed,
 * which is a small lie of exactly the kind rule 2 is about.
 *
 * ICEFALL CANNOT REACH A CLOSED APP, and the screen says so rather than
 * implying a Sunday-evening delivery. See `docs/weekly-review-notifications.md`
 * for what would have to exist before it could.
 *
 * ============================================================================
 * WHAT IS STORED, AND WHY IT IS SO SMALL
 * ============================================================================
 *
 * Two things per objective per week: whether the review has been opened, and
 * which proposals the athlete said no to.
 *
 * NOT which proposals they ACCEPTED. An accepted proposal leaves an adjustment
 * record behind, and that record is the truth about the plan; the engine checks
 * it directly (`alreadyChanged`) and so cannot re-offer a change that was
 * taken. A second store saying "this was accepted" could only ever disagree
 * with the first — the classic failure where the history and the calendar drift
 * apart, which `tracking/adjustments.ts` was shaped to prevent.
 *
 * A DECLINE, though, leaves nothing behind. Nothing changed; the plan is
 * exactly as it was. Without a record of it, the same proposal would be waiting
 * again on the next launch, which is how an app teaches somebody to stop
 * reading it. So declines are stored, and only declines.
 *
 * ON THE DEVICE, in `localStorage`, for the reasons `tracking/adjustments.ts`
 * sets out at length: there is no server table for any of this, and a write to
 * a table that does not exist fails silently and looks exactly like working.
 * Consequence, stated on the screen rather than buried here: a new phone will
 * offer the review again.
 */

const KEY = "icefall.coach.weekly-review.v1";

interface WeekRecord {
  /** When the athlete first opened this week's review. Absent until they do. */
  openedAt?: string;
  /** Proposal ids they declined. Never ids they accepted — see the header. */
  declined: string[];
}

interface Stored {
  weeks: Record<string, WeekRecord>;
}

const EMPTY: Stored = { weeks: {} };

/** One key per objective per week. A week of two objectives is two reviews. */
function keyFor(goalId: string, weekStart: string): string {
  return `${goalId}|${weekStart}`;
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.weeks !== "object") return EMPTY;
    const weeks: Record<string, WeekRecord> = {};
    for (const [k, v] of Object.entries(parsed.weeks ?? {})) {
      if (!v || typeof v !== "object") continue;
      const rec = v as Partial<WeekRecord>;
      weeks[k] = {
        openedAt: typeof rec.openedAt === "string" ? rec.openedAt : undefined,
        declined: Array.isArray(rec.declined) ? rec.declined.filter((d) => typeof d === "string") : [],
      };
    }
    return { weeks };
  } catch {
    /* Corrupt or unreadable. An unseen review is the safe wrong answer: the
       athlete is offered it again, rather than never being shown it at all. */
    return EMPTY;
  }
}

const listeners = new Set<(s: Stored) => void>();
let current: Stored = typeof localStorage === "undefined" ? EMPTY : read();

/**
 * Keep the last 40 weeks and no more. Roughly the length of a long build plus a
 * season, and far past the point where a declined proposal from last winter
 * matters. Oldest key by week start goes first.
 */
const MAX_WEEKS = 40;

function write(next: Stored) {
  const entries = Object.entries(next.weeks).sort((a, b) => a[0].localeCompare(b[0]));
  const kept = entries.length > MAX_WEEKS ? entries.slice(-MAX_WEEKS) : entries;
  current = { weeks: Object.fromEntries(kept) };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* Private mode or a full quota. It holds for this session and is gone on
       the next launch — the review simply appears as unseen again, which is
       the harmless direction for this particular failure. */
  }
  listeners.forEach((l) => l(current));
}

function patch(goalId: string, weekStart: string, change: (r: WeekRecord) => WeekRecord): void {
  const k = keyFor(goalId, weekStart);
  const existing = current.weeks[k] ?? { declined: [] };
  write({ weeks: { ...current.weeks, [k]: change(existing) } });
}

/** The athlete opened this week's review. Recorded once; never cleared. */
export function markReviewOpened(goalId: string, weekStart: string, at: string): void {
  patch(goalId, weekStart, (r) => (r.openedAt ? r : { ...r, openedAt: at }));
}

/** They said no to one proposal. Nothing was written to the plan. */
export function declineProposal(goalId: string, weekStart: string, proposalId: string): void {
  patch(goalId, weekStart, (r) =>
    r.declined.includes(proposalId) ? r : { ...r, declined: [...r.declined, proposalId] },
  );
}

/** For "Erase all data" — the same prefix rule every other ICEFALL store follows. */
export function clearWeeklyReviewState(): void {
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

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

/** Stamped once per app session. See the header — this is a claim, not a guess. */
const OPENED_AT = new Date().toISOString();

export interface WeeklyReviewBinding {
  review: WeeklyReview;
  /** The proposals still worth showing: declines removed. */
  proposals: ReviewProposal[];
  /** True when there is a review with something in it that has not been opened. */
  unseen: boolean;
  /** When the athlete first opened this week's review, or null. */
  openedAt: string | null;
  markOpened: () => void;
  decline: (proposalId: string) => void;
}

/**
 * Everything the review needs, read from the same hooks every other Coach
 * surface reads.
 *
 * `useCoachIntel` is the one hook the whole of Coach goes through, so the
 * measured vitals in this review are the same readings, from the same
 * instrument, as the ones behind the recovery score on the dashboard. There is
 * no second resolution of anything here.
 *
 * `useTraining` supplies the plan WITH adjustments applied and its own
 * `completedByDate` / `satisfiedByActivity`, so the review cannot form a second
 * opinion about whether a day was done.
 */
export function useWeeklyReview(): WeeklyReviewBinding {
  const { checkIns } = useApp();
  const training = useTraining();
  const intel = useCoachIntel();
  const stored = useStore();
  const adjustments = useAdjustments();
  const feed = useActivityFeed();

  /* SIMULATED RECORDINGS ARE DROPPED, exactly as `useCoachIntel` drops them.
     The tracker can be driven indoors so the app can be reviewed without a
     mountain; those sessions are badged SIMULATED in the feed and must never
     become training somebody did not do — least of all in a review that
     proposes changing their plan on the strength of it. */
  const activities = useMemo<ReviewActivity[]>(
    () =>
      feed
        .filter((a) => !a.simulated)
        .map((a) => ({
          id: a.id,
          title: a.title,
          startedAt: a.startedAt,
          durationSec: a.durationSec,
          distanceKm: a.distanceKm,
          elevationGainM: a.elevationGainM,
        })),
    [feed],
  );

  const review = useMemo(
    () =>
      buildWeeklyReview({
        today: isoDate(new Date()),
        computedAt: OPENED_AT,
        plan: training.plan,
        objective: training.goal
          ? { name: training.goal.name, targetDate: training.goal.targetDate }
          : null,
        completedByDate: training.completedByDate,
        satisfiedByActivity: training.satisfiedByActivity,
        activities,
        adjustments: training.goal
          ? livePlanAdjustments(adjustments, training.goal.id)
          : [],
        checkIns,
        vitals: intel.recovery.vitals,
        localDate: (iso) => isoDate(new Date(iso)),
      }),
    [training, activities, adjustments, checkIns, intel.recovery.vitals],
  );

  const goalId = training.goal?.id ?? "";
  const weekStart = review.window?.start ?? "";
  const record = stored.weeks[keyFor(goalId, weekStart)];

  const proposals = useMemo(
    () => review.proposals.filter((p) => !(record?.declined ?? []).includes(p.id)),
    [review.proposals, record],
  );

  return {
    review,
    proposals,
    /* An "unseen" badge is a promise that there is something to read. A review
       that turned out to be "your plan's first week has not finished yet" would
       make the badge a nuisance, so only a real one counts. */
    unseen: review.state === "ready" && !record?.openedAt && goalId !== "" && weekStart !== "",
    openedAt: record?.openedAt ?? null,
    markOpened: useCallback(() => {
      if (goalId && weekStart) markReviewOpened(goalId, weekStart, new Date().toISOString());
    }, [goalId, weekStart]),
    decline: useCallback(
      (proposalId: string) => {
        if (goalId && weekStart) declineProposal(goalId, weekStart, proposalId);
      },
      [goalId, weekStart],
    ),
  };
}
