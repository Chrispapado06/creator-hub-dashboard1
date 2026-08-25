import { activityById } from "./activities";
import { fmtDuration, fmtElevation, fmtPace } from "@/lib/format";
import type { RecordedActivity } from "./types";

/**
 * ICEFALL Insight — a short, factual read on the activity.
 *
 * Derived from the recorded splits and elevation, never invented. Two sentences
 * at most: the athlete is standing in a car park reading this, not sitting down
 * with a report.
 */
export function buildInsight(a: RecordedActivity): string | null {
  const type = activityById(a.activityTypeId);
  const parts: string[] = [];

  const splits = a.splits;

  if (splits.length >= 3) {
    const times = splits.map((s) => s.durationSec);
    const mean = times.reduce((x, y) => x + y, 0) / times.length;
    const sd = Math.sqrt(times.reduce((acc, t) => acc + (t - mean) ** 2, 0) / times.length);
    const cv = mean > 0 ? sd / mean : 0;

    // The most-climbing kilometre is usually the interesting one.
    const hardest = splits.reduce(
      (best, s) => (s.elevationGainM > best.elevationGainM ? s : best),
      splits[0],
    );

    if (hardest.elevationGainM >= 80) {
      parts.push(
        `Your strongest section came on kilometre ${hardest.index}, where you held ${fmtPace(hardest.durationSec)} /km through ${fmtElevation(hardest.elevationGainM)} m of climbing.`,
      );
    } else if (cv < 0.08) {
      parts.push(
        `Pacing was remarkably even — your kilometre splits varied by under ${Math.round(cv * 100)}% across the whole ${type.label.toLowerCase()}.`,
      );
    } else {
      const fastest = splits.reduce((b, s) => (s.durationSec < b.durationSec ? s : b), splits[0]);
      parts.push(
        `Your quickest kilometre was number ${fastest.index} at ${fmtPace(fastest.durationSec)} /km.`,
      );
    }

    // Negative split is worth calling out.
    const half = Math.floor(splits.length / 2);
    if (half >= 2) {
      const first = splits.slice(0, half).reduce((x, s) => x + s.durationSec, 0) / half;
      const second =
        splits.slice(half).reduce((x, s) => x + s.durationSec, 0) / (splits.length - half);
      if (second < first * 0.96) {
        parts.push(
          "You finished faster than you started, which is the harder way round and the better one.",
        );
      }
    }
  }

  if (parts.length === 0) {
    if (a.elevationGainM >= 300) {
      parts.push(
        `${fmtElevation(a.elevationGainM)} m of ascent in ${fmtDuration(a.movingSec)} — a genuine vertical session.`,
      );
    } else if (a.movingSec > 0) {
      parts.push(`${fmtDuration(a.movingSec)} of moving time recorded.`);
    } else {
      return null;
    }
  }

  if (a.verticalRateMPerH && a.verticalRateMPerH > 600 && type.verticalFocus) {
    parts.push(
      `An ascent rate of ${Math.round(a.verticalRateMPerH)} m/h puts you comfortably inside the range expected for alpine objectives.`,
    );
  }

  return parts.slice(0, 2).join(" ");
}

/**
 * Live, in-activity feedback. Kept rare and short — the athlete is outdoors and
 * should not be reading their phone.
 */
export interface LiveCue {
  id: string;
  label: string;
  body: string;
}

export function buildLiveCue(args: {
  distanceM: number;
  elevationGainM: number;
  verticalRateMPerH: number | null;
  paceSecPerKm: number | null;
  targetPaceSecPerKm?: number | null;
  elevationTargetM?: number | null;
  lastCueId?: string | null;
}): LiveCue | null {
  const {
    distanceM,
    elevationGainM,
    verticalRateMPerH,
    paceSecPerKm,
    targetPaceSecPerKm,
    elevationTargetM,
  } = args;

  // Vertical milestones, every 500 m.
  const vMilestone = Math.floor(elevationGainM / 500) * 500;
  if (vMilestone >= 500) {
    const id = `vert-${vMilestone}`;
    if (id !== args.lastCueId) {
      return { id, label: "Elevation", body: `${fmtElevation(vMilestone)} m climbed.` };
    }
  }

  // Distance milestones, every 5 km.
  const dMilestone = Math.floor(distanceM / 5000) * 5;
  if (dMilestone >= 5) {
    const id = `dist-${dMilestone}`;
    if (id !== args.lastCueId) {
      return { id, label: "Distance", body: `${dMilestone} km covered.` };
    }
  }

  if (elevationTargetM && elevationGainM > 0) {
    const pct = Math.floor(((elevationGainM / elevationTargetM) * 100) / 25) * 25;
    if (pct >= 25 && pct < 100) {
      const id = `goal-${pct}`;
      if (id !== args.lastCueId) {
        return { id, label: "Goal", body: `${pct}% of today's elevation target.` };
      }
    }
  }

  if (targetPaceSecPerKm && paceSecPerKm) {
    const delta = targetPaceSecPerKm - paceSecPerKm;
    if (Math.abs(delta) >= 12) {
      const id = `pace-${delta > 0 ? "up" : "down"}`;
      if (id !== args.lastCueId) {
        return {
          id,
          label: "Pace",
          body:
            delta > 0
              ? `You are ${Math.round(delta)} sec/km faster than target.`
              : `You are ${Math.round(-delta)} sec/km slower than target.`,
        };
      }
    }
  }

  if (verticalRateMPerH && verticalRateMPerH > 700) {
    const id = "vrate-strong";
    if (id !== args.lastCueId) {
      return { id, label: "Vertical", body: "Strong ascent rate over the last half hour." };
    }
  }

  return null;
}
