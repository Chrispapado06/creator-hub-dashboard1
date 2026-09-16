/**
 * THE objective the app is about — one rule, used everywhere a screen picks "the
 * athlete's objective" without being told which. Components read it through
 * `usePrimaryGoal()` (state/AppState), which also keeps it current at midnight
 * and knows which objectives have been debriefed.
 *
 * The soonest ACTIVE objective whose date is today or later. When nothing is
 * upcoming, the most recently dated one.
 *
 * It used to be the soonest active objective full stop, copied into six places,
 * with more screens taking the NEWEST active objective instead. That let an
 * objective left open after its date outrank the next one for ever, and let the
 * profile, the share card and the coaching profile name a different mountain
 * from Home and the plan. The new Home's reviews (2026-09-16) found both — so
 * the rule lives here.
 *
 * ONE DAY OF GRACE, for objectives not yet debriefed. A target date is stored as
 * an instant. Read in a timezone more than a few hours west of where it was set,
 * it lands on the previous calendar day — so on the summit day itself the
 * objective would count as passed and the next one would take over. Yesterday's
 * objective therefore stays the objective for one more day, unless the athlete
 * has already debriefed it.
 */

/** Days after an objective's date that it is still "just behind" the athlete. */
export const RECENT_OBJECTIVE_DAYS = 14;

/** Days before an objective's date that count as preparing for the trip. */
export const TRIP_PREP_WINDOW_DAYS = 14;

const NONE: ReadonlySet<string> = new Set();

/** A local calendar day (YYYY-MM-DD) from either a day key or an ISO instant. */
export function localDayOf(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayOffset(now: Date, days: number): string {
  return localDayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12).toISOString());
}

function daysFrom(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

type Pickable = { id: string; status: string; targetDate: string };

const byDate = <G extends Pickable>(goals: readonly G[]) =>
  goals
    .filter((g) => g.status === "active")
    .sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate));

export function pickPrimaryGoal<G extends Pickable>(
  goals: readonly G[],
  now: Date = new Date(),
  debriefedGoalIds: ReadonlySet<string> = NONE,
): G | undefined {
  const active = byDate(goals);
  const today = dayOffset(now, 0);
  const yesterday = dayOffset(now, -1);
  const upcoming = active.find((g) => {
    const day = localDayOf(g.targetDate);
    return day >= today || (day === yesterday && !debriefedGoalIds.has(g.id));
  });
  return upcoming ?? active[active.length - 1];
}

/**
 * The ids of objectives whose trip already HAPPENED: a trip record that runs to
 * (or past) the objective's date and was not closed before it began. A warm-up
 * trip that ended weeks earlier, or a record closed to fix its dates, does not
 * count.
 */
export function goalIdsWithTheirTrip(
  goals: readonly Pickable[],
  trips: readonly { goalId: string | null; startDate: string; endDate: string; endedAt: string | null }[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const g of goals) {
    const target = localDayOf(g.targetDate);
    const has = trips.some(
      (t) =>
        t.goalId === g.id &&
        !(t.endedAt !== null && localDayOf(t.endedAt) < t.startDate) &&
        t.endDate >= target,
    );
    if (has) ids.add(g.id);
  }
  return ids;
}

/**
 * The objective a NEW TRIP belongs to.
 *
 * The primary objective when its date is close (within the trip-prep window) —
 * that is the one Home is preparing the athlete for. Otherwise, when an
 * objective's date slipped (weather, a late flight) and the trip starts a few
 * days after it, the trip is for THAT objective: the most recent one whose date
 * passed within `RECENT_OBJECTIVE_DAYS`, not yet debriefed, and with no trip of
 * its own already. Failing both, the primary objective.
 */
export function pickTripGoal<G extends Pickable>(
  goals: readonly G[],
  debriefedGoalIds: ReadonlySet<string>,
  now: Date = new Date(),
  goalIdsWithATrip: ReadonlySet<string> = NONE,
): G | undefined {
  const today = dayOffset(now, 0);
  const primary = pickPrimaryGoal(goals, now, debriefedGoalIds);
  if (primary) {
    const until = daysFrom(today, localDayOf(primary.targetDate));
    /* Yesterday's objective (the day of grace) whose trip already happened is
       done with: a new trip is for whatever comes next. */
    if (until === -1 && goalIdsWithATrip.has(primary.id)) {
      return pickTripGoal(
        goals.filter((g) => g.id !== primary.id),
        debriefedGoalIds,
        now,
        goalIdsWithATrip,
      );
    }
    if (until >= -1 && until <= TRIP_PREP_WINDOW_DAYS) return primary;
  }
  const windowStart = dayOffset(now, -RECENT_OBJECTIVE_DAYS);
  const slipped = byDate(goals)
    .filter((g) => {
      const day = localDayOf(g.targetDate);
      return (
        day < today &&
        day >= windowStart &&
        !debriefedGoalIds.has(g.id) &&
        !goalIdsWithATrip.has(g.id)
      );
    })
    .pop();
  return slipped ?? primary;
}
