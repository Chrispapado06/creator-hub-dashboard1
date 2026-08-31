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

/**
 * PH-01 — REMOVED FROM THE SYSTEM, NOT JUST FROM THE CODE.
 *
 * The owner asked for points to be removed from the system. Deleting the
 * engine, the fields and the screens does not touch a record already sitting in
 * `icefall.activities.v1` on somebody's phone: this function parsed stored JSON
 * straight into the type with no normalisation, so `points_awarded` and
 * `pointsBreakdown` would have survived every code change and come back out in
 * the data export (`settings/Sections.tsx` walks every `icefall.*` key
 * wholesale, so no search for "points" would ever have shown it).
 *
 * They are stripped here, on the one read path every caller goes through. The
 * write path then persists the cleaned record, so the fields disappear from the
 * device the first time anything saves — no migration step, no version flag,
 * and nothing to run.
 *
 * `points` — the GPS track — is deliberately untouched.
 */
type LegacyPointsFields = { points_awarded?: unknown; pointsBreakdown?: unknown };

export function loadActivities(): RecordedActivity[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecordedActivity[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((a) => {
      const { points_awarded: _p, pointsBreakdown: _b, ...rest } =
        a as RecordedActivity & LegacyPointsFields;
      return rest as RecordedActivity;
    });
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
