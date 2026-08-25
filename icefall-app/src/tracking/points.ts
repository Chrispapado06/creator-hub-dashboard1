import { activityById } from "./activities";
import type { RecordedActivity } from "./types";

/**
 * ICEFALL Points.
 *
 * Deliberately not distance-only: vertical, activity type and simply finishing
 * all contribute, so a 900 m ascent on a short approach scores like the serious
 * day it is.
 *
 * SAFETY IS PART OF THE SPEC. Points must never make it rational to keep going
 * when an athlete should stop, so every component is capped and the caps are
 * shown to the user. There are no multipliers for finishing late, for bad
 * weather, or for continuous streak length beyond a modest weekly bonus.
 */

/** Beyond this, extra time earns nothing. */
export const MOVING_MINUTES_CAP = 300; // 5 hours
export const DISTANCE_KM_CAP = 60;
export const VERTICAL_M_CAP = 3000;

/** Points per kilometre, by activity family. Slower, harder ground scores more. */
const DISTANCE_WEIGHT: Record<string, number> = {
  running: 4,
  hiking: 3.5,
  cycling: 1.4,
  mountaineering: 5,
  climbing: 4,
  winter: 2.5,
  water: 3,
  other: 2.5,
};

export interface PointsBreakdown {
  label: string;
  points: number;
  /** Shown when a cap has been reached, so the ceiling is never a mystery. */
  note?: string;
}

export interface PointsResult {
  total: number;
  breakdown: PointsBreakdown[];
  notes: string[];
}

export interface PointsContext {
  /** Distinct days with an activity in the current week, before this one. */
  activeDaysThisWeek?: number;
  /** True when this activity unlocks at least one achievement. */
  firstOfKind?: boolean;
}

export function scoreActivity(a: RecordedActivity, ctx: PointsContext = {}): PointsResult {
  const type = activityById(a.activityTypeId);
  const breakdown: PointsBreakdown[] = [];
  const notes: string[] = [];

  // 1. Completion — every finished session is worth something.
  breakdown.push({ label: "Session completed", points: 20 });

  // 2. Time on feet, capped.
  const movingMin = a.movingSec / 60;
  const cappedMin = Math.min(movingMin, MOVING_MINUTES_CAP);
  if (cappedMin > 0) {
    breakdown.push({
      label: "Time moving",
      points: Math.round(cappedMin * 0.35),
      note: movingMin > MOVING_MINUTES_CAP ? `Capped at ${MOVING_MINUTES_CAP / 60} h` : undefined,
    });
    if (movingMin > MOVING_MINUTES_CAP) {
      notes.push(
        "Points stop accruing after five hours. ICEFALL does not reward staying out longer.",
      );
    }
  }

  // 3. Distance, weighted by how hard the ground is.
  const km = Math.min(a.distanceM / 1000, DISTANCE_KM_CAP);
  if (km > 0.05) {
    const w = DISTANCE_WEIGHT[type.family] ?? 2.5;
    breakdown.push({
      label: "Distance",
      points: Math.round(km * w),
      note: a.distanceM / 1000 > DISTANCE_KM_CAP ? `Capped at ${DISTANCE_KM_CAP} km` : undefined,
    });
  }

  // 4. Vertical — where ICEFALL differs from a road-running app.
  const gain = Math.min(a.elevationGainM, VERTICAL_M_CAP);
  if (gain >= 10) {
    breakdown.push({
      label: "Vertical",
      points: Math.round(gain / 10),
      note: a.elevationGainM > VERTICAL_M_CAP ? `Capped at ${VERTICAL_M_CAP} m` : undefined,
    });
  }

  // 5. Vertical milestones — thresholds, not a slope, so there is no reason to
  //    squeeze out "just a bit more" on tired legs.
  const milestone = [1000, 2000, 3000].filter((m) => a.elevationGainM >= m).pop();
  if (milestone) {
    breakdown.push({
      label: `${milestone.toLocaleString("en-GB")} m ascent`,
      points: milestone / 20,
    });
  }

  // 6. Consistency — the behaviour actually worth encouraging.
  const days = ctx.activeDaysThisWeek ?? 0;
  if (days >= 2) {
    breakdown.push({
      label: "Weekly consistency",
      points: Math.min(days, 5) * 6,
      note: days > 5 ? "Capped at five days" : undefined,
    });
  }

  if (ctx.firstOfKind) breakdown.push({ label: "New achievement", points: 100 });

  const total = breakdown.reduce((sum, b) => sum + b.points, 0);

  notes.push("Points reward consistency and vertical, never speed on dangerous ground.");

  return { total, breakdown, notes };
}
