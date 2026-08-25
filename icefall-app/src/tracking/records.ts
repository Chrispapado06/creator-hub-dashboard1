import { activityById } from "./activities";
import { fmtDistance, fmtDuration, fmtElevation, fmtPace } from "@/lib/format";
import type { RecordedActivity } from "./types";

/**
 * Personal records and achievements.
 *
 * Detected by comparing a finished activity against everything recorded before
 * it, so "new personal best" means something. Achievements are one-time
 * milestones; records are beatable.
 */

export interface DetectedRecord {
  id: string;
  label: string;
  value: string;
  /** What the previous best was, when there was one. */
  previous?: string;
}

export interface DetectedAchievement {
  id: string;
  name: string;
  detail: string;
}

/** Fastest continuous split-window of N km, derived from recorded splits. */
function fastestWindowSec(a: RecordedActivity, km: number): number | null {
  if (a.splits.length < km) return null;
  let best = Infinity;
  for (let i = 0; i + km <= a.splits.length; i++) {
    let sum = 0;
    for (let j = i; j < i + km; j++) sum += a.splits[j].durationSec;
    best = Math.min(best, sum);
  }
  return Number.isFinite(best) ? best : null;
}

export function detectRecords(a: RecordedActivity, history: RecordedActivity[]): DetectedRecord[] {
  const out: DetectedRecord[] = [];
  const prior = history.filter((h) => h.id !== a.id);
  const sameFamily = prior.filter(
    (h) => activityById(h.activityTypeId).family === activityById(a.activityTypeId).family,
  );

  const best = <T>(list: T[], pick: (x: T) => number | null): number | null => {
    const vals = list.map(pick).filter((v): v is number => v !== null && Number.isFinite(v));
    return vals.length ? Math.max(...vals) : null;
  };

  // Longest distance
  if (a.distanceM > 500) {
    const prev = best(sameFamily, (h) => h.distanceM);
    if (prev === null || a.distanceM > prev) {
      out.push({
        id: "longest-distance",
        label: "Longest distance",
        value: `${fmtDistance(a.distanceM / 1000)} km`,
        previous: prev ? `${fmtDistance(prev / 1000)} km` : undefined,
      });
    }
  }

  // Most elevation in one activity
  if (a.elevationGainM > 100) {
    const prev = best(prior, (h) => h.elevationGainM);
    if (prev === null || a.elevationGainM > prev) {
      out.push({
        id: "most-vertical",
        label: "Most ascent in one activity",
        value: `${fmtElevation(a.elevationGainM)} m`,
        previous: prev ? `${fmtElevation(prev)} m` : undefined,
      });
    }
  }

  // Highest point reached
  if (a.maxAltitudeM !== null) {
    const prev = best(prior, (h) => h.maxAltitudeM);
    if (prev === null || a.maxAltitudeM > prev) {
      out.push({
        id: "highest-altitude",
        label: "Highest altitude",
        value: `${fmtElevation(a.maxAltitudeM)} m`,
        previous: prev !== null ? `${fmtElevation(prev)} m` : undefined,
      });
    }
  }

  // Longest activity by moving time
  if (a.movingSec > 600) {
    const prev = best(prior, (h) => h.movingSec);
    if (prev === null || a.movingSec > prev) {
      out.push({
        id: "longest-duration",
        label: "Longest activity",
        value: fmtDuration(a.movingSec),
        previous: prev ? fmtDuration(prev) : undefined,
      });
    }
  }

  // Fastest 5 km / 10 km — lower is better, so compared separately.
  for (const km of [5, 10]) {
    const now = fastestWindowSec(a, km);
    if (now === null) continue;
    const priorBests = sameFamily
      .map((h) => fastestWindowSec(h, km))
      .filter((v): v is number => v !== null);
    const prev = priorBests.length ? Math.min(...priorBests) : null;
    if (prev === null || now < prev) {
      out.push({
        id: `fastest-${km}k`,
        label: `Fastest ${km} km`,
        value: fmtDuration(now),
        previous: prev ? fmtDuration(prev) : undefined,
      });
    }
  }

  return out;
}

const ACHIEVEMENT_RULES: {
  id: string;
  name: string;
  detail: string;
  test: (a: RecordedActivity) => boolean;
}[] = [
  {
    id: "first-5k",
    name: "First 5K",
    detail: "Completed a 5 kilometre activity.",
    test: (a) => a.distanceM >= 5000,
  },
  {
    id: "first-10k",
    name: "First 10K",
    detail: "Completed a 10 kilometre activity.",
    test: (a) => a.distanceM >= 10_000,
  },
  {
    id: "first-half",
    name: "Half Distance",
    detail: "Completed 21.1 kilometres.",
    test: (a) => a.distanceM >= 21_097,
  },
  {
    id: "first-500-ascent",
    name: "First 500 m",
    detail: "Climbed 500 metres in one activity.",
    test: (a) => a.elevationGainM >= 500,
  },
  {
    id: "first-1000-ascent",
    name: "First 1,000 m Ascent",
    detail: "Climbed 1,000 metres in one activity.",
    test: (a) => a.elevationGainM >= 1000,
  },
  {
    id: "first-2000-ascent",
    name: "Alpine Milestone",
    detail: "Climbed 2,000 metres in one activity.",
    test: (a) => a.elevationGainM >= 2000,
  },
  {
    id: "above-3000",
    name: "Three Thousand",
    detail: "Reached 3,000 metres above sea level.",
    test: (a) => (a.maxAltitudeM ?? 0) >= 3000,
  },
  {
    id: "above-4000",
    name: "Four Thousand",
    detail: "Reached 4,000 metres above sea level.",
    test: (a) => (a.maxAltitudeM ?? 0) >= 4000,
  },
  {
    id: "alpine-start",
    name: "Alpine Start",
    detail: "Began an activity before 05:00.",
    test: (a) => new Date(a.startedAt).getHours() < 5,
  },
  {
    id: "long-day",
    name: "Long Day",
    detail: "Four hours of moving time.",
    test: (a) => a.movingSec >= 4 * 3600,
  },
];

/** Everything ICEFALL can award, for the profile grid. */
export const ACHIEVEMENT_CATALOGUE: DetectedAchievement[] = ACHIEVEMENT_RULES.map(
  ({ id, name, detail }) => ({ id, name, detail }),
);

export function detectAchievements(
  a: RecordedActivity,
  alreadyEarned: string[],
): DetectedAchievement[] {
  return ACHIEVEMENT_RULES.filter((r) => !alreadyEarned.includes(r.id) && r.test(a)).map(
    ({ id, name, detail }) => ({ id, name, detail }),
  );
}

/** Short, factual summary line used on the completion screen. */
export function recordHeadline(records: DetectedRecord[]): string | null {
  if (!records.length) return null;
  const r = records[0];
  return r.previous ? `${r.label} — ${r.value}, beating ${r.previous}` : `${r.label} — ${r.value}`;
}

export { fmtPace };
