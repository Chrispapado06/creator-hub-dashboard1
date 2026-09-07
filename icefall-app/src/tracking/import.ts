import { finalizeActivity } from "./finalize";
import { loadActivities } from "./store";
import type { RecordedActivity } from "./types";
import { watchActivityToRecorded } from "@/watch/map";
import type { WatchActivity, WatchProvider } from "@/watch/types";

/**
 * THE ONLY CONSTRUCTOR OF AN IMPORTED RECORD.
 *
 * Builds a `RecordedActivity` from a watch service's summary via
 * `watchActivityToRecorded`, then hands it to `finalizeActivity` — the same
 * single entry seam `ActivityRecorder.finish()` uses (finalize.ts:27). This
 * NEVER calls `saveActivity` directly: that would bypass the records/
 * achievements gate, the meta write and `invalidateFeed()`, exactly the
 * mistake the seam exists to prevent.
 */
export function importWatchActivity(
  w: WatchActivity,
  provider: WatchProvider,
): { written: boolean; activity: RecordedActivity } {
  const recorded = watchActivityToRecorded(w, provider);

  // `saveActivity` (called inside `finalizeActivity`) de-dupes by id, but it
  // always overwrites and reports nothing about whether the id was new — and
  // the caller needs to know, to tell "brought across 3" from "nothing new"
  // honestly rather than counting a re-import as a fresh one.
  const existed = loadActivities().some((a) => a.id === recorded.id);

  const { activity } = finalizeActivity(recorded);
  return { written: !existed, activity };
}
