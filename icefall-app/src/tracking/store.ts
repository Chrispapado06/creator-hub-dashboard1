import type { RecordedActivity } from "./types";
import {
  ACTIVITIES_KEY,
  isActivitiesOnDevice,
  normaliseActivity,
  readDeviceActivities,
  removeDeviceActivity,
  writeDeviceActivity,
} from "@/device/migrateActivities";

/**
 * Persistence for recorded activities.
 *
 * The browser bucket until `device/migrateActivities.ts` has moved the history
 * into the on-device database and verified it; the database after. Callers
 * stay synchronous either way — in device mode they read an in-memory copy.
 * Point stripping (PH-01) and the `origin` default live in `normaliseActivity`.
 */

const KEY = ACTIVITIES_KEY;
const META_KEY = "icefall.athlete.v1";

export interface AthleteMeta {
  earnedAchievements: string[];
}

const EMPTY_META: AthleteMeta = { earnedAchievements: [] };

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
  const onDevice = readDeviceActivities();
  if (onDevice) return onDevice;
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normaliseActivity);
  } catch {
    return [];
  }
}

export function saveActivity(a: RecordedActivity): RecordedActivity[] {
  const trimmed: RecordedActivity = { ...a, points: thin(a.points, MAX_POINTS_STORED) };
  if (isActivitiesOnDevice()) {
    writeDeviceActivity(trimmed);
    return readDeviceActivities() ?? [];
  }
  const all = loadActivities();
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
  if (isActivitiesOnDevice()) {
    removeDeviceActivity(id);
    return readDeviceActivities() ?? [];
  }
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
    if (!raw) return EMPTY_META;
    // Same reason as `loadActivities`: an existing device's `icefall.athlete.v1`
    // still holds the lifetime `totalPoints`. Spreading it in would carry the
    // field straight back into memory and into the data export.
    const { totalPoints: _t, ...stored } = JSON.parse(raw) as Partial<AthleteMeta> & {
      totalPoints?: unknown;
    };
    return { ...EMPTY_META, ...stored };
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
