import type { RecordedActivity } from "./types";

/**
 * Persistence for recorded activities.
 *
 * localStorage today; the shape is deliberately a plain serialisable record so
 * swapping in IndexedDB (for long tracks) or a server sync layer is a change
 * here and nowhere else.
 */

const KEY = "icefall.activities.v1";
const META_KEY = "icefall.athlete.v1";

export interface AthleteMeta {
  totalPoints: number;
  earnedAchievements: string[];
}

const EMPTY_META: AthleteMeta = { totalPoints: 0, earnedAchievements: [] };

/** Long tracks are trimmed before storage so a session can't blow the quota. */
const MAX_POINTS_STORED = 900;

function thin<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const stride = Math.ceil(arr.length / max);
  const out = arr.filter((_, i) => i % stride === 0);
  if (arr.length && out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}

export function loadActivities(): RecordedActivity[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecordedActivity[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveActivity(a: RecordedActivity): RecordedActivity[] {
  const all = loadActivities();
  const trimmed: RecordedActivity = { ...a, points: thin(a.points, MAX_POINTS_STORED) };
  const next = [trimmed, ...all.filter((x) => x.id !== a.id)];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded — drop the oldest and try once more.
    try {
      localStorage.setItem(KEY, JSON.stringify(next.slice(0, 20)));
    } catch {
      /* give up silently; the activity is still in memory for this session */
    }
  }
  return next;
}

export function deleteActivity(id: string): RecordedActivity[] {
  const next = loadActivities().filter((a) => a.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function loadMeta(): AthleteMeta {
  if (typeof localStorage === "undefined") return EMPTY_META;
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? { ...EMPTY_META, ...(JSON.parse(raw) as Partial<AthleteMeta>) } : EMPTY_META;
  } catch {
    return EMPTY_META;
  }
}

export function saveMeta(m: AthleteMeta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/** Distinct calendar days with a recorded activity in the current week. */
export function activeDaysThisWeek(all: RecordedActivity[], now = new Date()): number {
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const days = new Set<string>();
  for (const a of all) {
    const d = new Date(a.startedAt);
    if (d >= monday) days.add(d.toDateString());
  }
  return days.size;
}
