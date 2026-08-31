import { useMemo, useSyncExternalStore } from "react";
import { recordedToActivity } from "./adapt";
import { loadActivities, loadMeta } from "./store";
import { sync } from "@/services/repository";
import { USER } from "@/data/mock/athlete";
import type { Activity, WeeklyProgress } from "@/types";
import type { RecordedActivity } from "./types";

/**
 * One feed for the whole app: activities the athlete actually recorded, merged
 * with the seeded history, newest first. Screens don't need to know which is
 * which — recorded ones simply carry more truth.
 */

/* -------------------------------------------------------------------------- */
/* The seeded athlete — DEV ONLY                                               */
/* -------------------------------------------------------------------------- */

/**
 * THE FIXTURE IS NOT THE USER'S HISTORY.
 *
 * `state/AppState.tsx` closed this hole once, for summits and achievements:
 * spreading the demo athlete gave a fresh install four summits they never
 * climbed, rendered as their own on the Profile, the Mountain Passport and the
 * Mountain CV. It re-opened here by a second path. This module merged the
 * fixture's twelve activities into the feed unconditionally and started career
 * totals from `USER.stats`, so a first-run Profile read 128 activities,
 * 1,245 km, 78,540 m and 6 summits before the athlete had recorded anything at
 * all — the same lie, in bigger type, on the same screen.
 *
 * Both seams are gated here rather than at each call site, because the last fix
 * was correct and still got bypassed by a screen reading a different function.
 * Anything downstream that wants seeded data now has to come through these two
 * constants, and in a production build they are empty and zero.
 *
 * ZERO IS THE HONEST ANSWER HERE, and this is not the "never a zero" case. The
 * doctrine forbids a zero standing in for a figure ICEFALL cannot measure.
 * These four are counts of what the athlete has recorded IN ICEFALL, which is a
 * thing it measures exactly; before they record anything the true count is
 * none. The Profile says so in words rather than leaving four bare zeroes to be
 * read as a verdict on the athlete.
 */
const SEEDED_FEED: Activity[] = import.meta.env.DEV ? sync.activities : [];

/** What a career total starts from when nothing has been recorded: nothing. */
export const NO_SEEDED_TOTALS = {
  activities: 0,
  distanceKm: 0,
  elevationM: 0,
  timeHours: 0,
  summits: 0,
} as const;

const SEEDED_TOTALS = import.meta.env.DEV ? USER.stats : NO_SEEDED_TOTALS;

let cachedRaw: RecordedActivity[] | null = null;
const listeners = new Set<() => void>();

function read(): RecordedActivity[] {
  if (cachedRaw === null) cachedRaw = loadActivities();
  return cachedRaw;
}

/** Call after writing an activity so every mounted screen re-reads. */
export function invalidateFeed() {
  cachedRaw = null;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useRecordedActivities(): RecordedActivity[] {
  return useSyncExternalStore(subscribe, read, () => []);
}

export function useActivityFeed(): Activity[] {
  const recorded = useRecordedActivities();
  return useMemo(() => {
    const mapped = recorded.map(recordedToActivity);
    return [...mapped, ...SEEDED_FEED].sort(
      (a, b) => +new Date(b.startedAt) - +new Date(a.startedAt),
    );
  }, [recorded]);
}

/** Resolves an id against recorded activities first, then the seeded set. */
export function useActivityById(id: string | undefined) {
  const recorded = useRecordedActivities();
  return useMemo(() => {
    if (!id) return { activity: undefined, recorded: undefined };
    const rec = recorded.find((r) => r.id === id);
    if (rec) return { activity: recordedToActivity(rec), recorded: rec };
    return { activity: SEEDED_FEED.find((a) => a.id === id), recorded: undefined };
  }, [id, recorded]);
}

/**
 * Weekly progress computed from what the athlete has actually done, seeded and
 * recorded alike. Previously the dashboard and the Coach both read a fixed
 * fixture, so recording an activity changed nothing — which quietly broke the
 * one promise the ecosystem makes.
 */
export function useWeeklyProgress(): WeeklyProgress {
  const feed = useActivityFeed();
  return useMemo(() => {
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    const daily = [0, 0, 0, 0, 0, 0, 0];
    let distanceKm = 0;
    let elevationM = 0;
    let seconds = 0;
    let activities = 0;

    for (const a of feed) {
      // A simulated session is not training. Counting it here would inflate the
      // dashboard, the Coach's week and the athlete's sense of their own form.
      if (a.simulated) continue;
      const d = new Date(a.startedAt);
      if (d < monday) continue;
      const idx = (d.getDay() + 6) % 7;
      daily[idx] += a.distanceKm;
      distanceKm += a.distanceKm;
      elevationM += a.elevationGainM;
      seconds += a.durationSec;
      activities += 1;
    }

    return {
      distanceKm,
      activities,
      timeHours: seconds / 3600,
      elevationM,
      daily: daily.map((v) => Number(v.toFixed(2))),
    };
  }, [feed]);
}

/**
 * Totals over what this athlete has recorded in ICEFALL.
 *
 * Not "career totals" — ICEFALL knows nothing about the years before it was
 * installed and must not imply that it does. In DEV the baseline is the demo
 * athlete's fixture so a populated Profile can be judged; everywhere else it is
 * zero and the count grows from the first real recording. See the header.
 */
export function useAthleteTotals() {
  const recorded = useRecordedActivities();
  return useMemo(() => {
    const base = SEEDED_TOTALS;
    return recorded
      .filter((r) => !r.simulated)
      .reduce(
        (acc, r) => ({
          activities: acc.activities + 1,
          distanceKm: acc.distanceKm + r.distanceM / 1000,
          elevationM: acc.elevationM + r.elevationGainM,
          timeHours: acc.timeHours + r.movingSec / 3600,
          summits: acc.summits,
        }),
        { ...base },
      );
  }, [recorded]);
}

/** All-time personal bests across every recorded activity. */
export function useAllTimeRecords() {
  const all = useRecordedActivities();
  return useMemo(() => {
    // Personal bests are claims about the athlete. A simulated track can out-run
    // anything they have actually done, so it is excluded at the source.
    const recorded = all.filter((r) => !r.simulated);
    if (recorded.length === 0) return [];
    const best = <T>(pick: (r: (typeof recorded)[number]) => number | null) =>
      recorded.map(pick).filter((v): v is number => v !== null && Number.isFinite(v));

    const dist = best((r) => r.distanceM);
    const gain = best((r) => r.elevationGainM);
    const alt = best((r) => r.maxAltitudeM);
    const dur = best((r) => r.movingSec);

    const out: { id: string; label: string; value: string }[] = [];
    if (dist.length)
      out.push({
        id: "dist",
        label: "Longest distance",
        value: `${(Math.max(...dist) / 1000).toFixed(2)} km`,
      });
    if (gain.length)
      out.push({
        id: "gain",
        label: "Most ascent",
        value: `${Math.round(Math.max(...gain)).toLocaleString("en-GB")} m`,
      });
    if (alt.length)
      out.push({
        id: "alt",
        label: "Highest altitude",
        value: `${Math.round(Math.max(...alt)).toLocaleString("en-GB")} m`,
      });
    if (dur.length) {
      const s = Math.max(...dur);
      out.push({
        id: "dur",
        label: "Longest activity",
        value: `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`,
      });
    }
    return out;
  }, [all]);
}

/** Aggregate totals for the history screen. */
/**
 * SIMULATED SESSIONS ARE EXCLUDED HERE, NOT AT THE CALL SITE.
 *
 * The simulator exists so the recorder can be exercised indoors, and it labels
 * everything it produces. But a simulated track can cover more ground in ten
 * minutes than a real day out, and every screen that adds activities up had to
 * remember to drop them. `useWeeklyProgress` and `useAllTimeRecords` did;
 * `ActivityHistory` did not, in four separate places, so the history totals,
 * the eight-week chart, the per-sport breakdown and the year card all counted
 * work nobody had done.
 *
 * Filtering inside the two shared aggregation helpers makes that impossible to
 * forget rather than merely documented. A screen that genuinely wants to LIST
 * simulated sessions still can — they are excluded from the arithmetic, not
 * from the feed.
 */
export function summarise(list: Activity[]) {
  return list.filter((a) => !a.simulated).reduce(
    (acc, a) => ({
      count: acc.count + 1,
      distanceKm: acc.distanceKm + a.distanceKm,
      elevationM: acc.elevationM + a.elevationGainM,
      hours: acc.hours + a.durationSec / 3600,
      calories: acc.calories + (a.calories ?? 0),
    }),
    { count: 0, distanceKm: 0, elevationM: 0, hours: 0, calories: 0 },
  );
}

/** Buckets activities into the last N ISO weeks for the history chart. */
export function weeklyBuckets(list: Activity[], weeks = 8) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(monday);
    start.setDate(start.getDate() - (weeks - 1 - i) * 7);
    return { start, distanceKm: 0, elevationM: 0, count: 0 };
  });

  for (const a of list) {
    // See `summarise` — simulated sessions never enter an aggregate.
    if (a.simulated) continue;
    const t = new Date(a.startedAt).getTime();
    for (let i = buckets.length - 1; i >= 0; i--) {
      const s = buckets[i].start.getTime();
      const e = s + 7 * 86_400_000;
      if (t >= s && t < e) {
        buckets[i].distanceKm += a.distanceKm;
        buckets[i].elevationM += a.elevationGainM;
        buckets[i].count += 1;
        break;
      }
    }
  }
  return buckets;
}
