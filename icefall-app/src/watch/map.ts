import { activityById } from "@/tracking/activities";
import type { ActivityTypeId, RecordedActivity } from "@/tracking/types";
import type { WatchActivity, WatchProvider } from "./types";

/**
 * WatchActivity → RecordedActivity. The one place a vendor's summary becomes
 * an ICEFALL record, and the one place every rule below is enforced.
 *
 * Every rule here exists to avoid inventing a figure the watch service did not
 * report. Nothing is derived, nothing is estimated, and nothing that would
 * read as a sensor reading is filled in from a guess.
 */

/**
 * Vendor sport string → ICEFALL's own activity type, per provider.
 *
 * DELIBERATELY EMPTY FOR ALL FOUR PROVIDERS TODAY. The research behind this
 * integration confirms tool names and endpoints but NOT the actual field
 * values a vendor sends for `sport`:
 *   - COROS publishes no response schema at all for `querySportRecords` — the
 *     server adapter returns `[]` until a real authenticated call has been
 *     read (see coros.ts).
 *   - Polar v4's `sport.id` and Suunto's `activityId` are both documented as
 *     numeric ids with no published id→name table reachable without a signed
 *     agreement or a live account.
 *   - Garmin has no adapter at all yet.
 * Guessing a mapping here would be exactly the failure the Strava SPORT map
 * (icefall-supabase/supabase/functions/strava/index.ts:256-293) was written to
 * avoid on the other side of this same integration: filing an unfamiliar sport
 * under the nearest-sounding ICEFALL type is a claim about what the athlete
 * did, not a formatting choice. Every entry lands on "other" via the fallback
 * below until a real vendor response has been read and a confirmed mapping is
 * written here, in this file, with the date it was read — the same rule
 * coros.ts follows for its own response mapping.
 */
const SPORT_TO_TYPE: Record<WatchProvider, Record<string, ActivityTypeId>> = {
  coros: {},
  polar: {},
  suunto: {},
  garmin: {},
};

export function watchActivityToRecorded(
  w: WatchActivity,
  provider: WatchProvider,
): RecordedActivity {
  const activityTypeId: ActivityTypeId = SPORT_TO_TYPE[provider][w.sport] ?? "other";
  const type = activityById(activityTypeId);
  const startedAtMs = new Date(w.startedAt).getTime();
  // Elapsed end time, computed from the vendor's own duration — not a second
  // measurement, just the arithmetic end of the first one. Falls back to the
  // start time itself if the vendor's `startedAt` did not parse, so this never
  // throws on a malformed date.
  const endedAt = Number.isFinite(startedAtMs)
    ? new Date(startedAtMs + w.durationSec * 1000).toISOString()
    : w.startedAt;
  const movingSecMeasured = w.movingSec !== null;

  return {
    // ICEFALL's own ids are `act-<ms>` (recorder.ts:836); this prefix can never
    // collide with one, and `saveActivity` already de-dupes by id (store.ts:71)
    // so re-importing the same watch activity is a no-op, not a duplicate.
    id: `import:${provider}:${w.providerActivityId}`,
    activityTypeId,
    title: w.name?.trim() || type.label,
    startedAt: w.startedAt,
    endedAt,
    simulated: false,

    origin: {
      kind: "imported",
      provider,
      providerActivityId: w.providerActivityId,
      deviceName: w.deviceName,
      importedAt: new Date().toISOString(),
      vendorEntered: w.vendorEntered,
      movingSecMeasured,
    },

    durationSec: w.durationSec,
    // NOT a measurement when the vendor gave one duration only — the flag on
    // `origin` above is what stops this number being displayed as one.
    movingSec: w.movingSec ?? w.durationSec,
    distanceM: w.distanceM ?? 0,
    elevationGainM: w.elevationGainM ?? 0,
    elevationLossM: w.elevationLossM ?? 0,
    // None of these are derivable from a summary with no track. Null, not a
    // computed guess.
    maxAltitudeM: null,
    minAltitudeM: null,
    avgSpeedMps: null,
    avgPaceSecPerKm: null,
    avgHeartRateBpm: w.avgHeartRateBpm,
    maxHeartRateBpm: w.maxHeartRateBpm,
    avgCadenceSpm: null,
    calories: w.calories,
    // No `caloriesForKg` — this is the vendor's own estimate, not ICEFALL's MET
    // model, so the "estimated for 72 kg" line must never appear on it.
    verticalRateMPerH: null,
    temperatureC: null,

    // v1 imports NO TRACK. See the risks section of the watch-accounts plan.
    points: [],
    splits: [],
    capabilities: {
      gps: false,
      barometricAltitude: false,
      heartRate: false,
      cadence: false,
      power: false,
      temperature: false,
    },
    // No `location` — `recordedToActivity` supplies the provenance line for an
    // imported activity from `origin` instead.
  };
}
