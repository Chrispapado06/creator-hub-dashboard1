import { activityById } from "@/tracking/activities";
import type { ActivityTypeId, RecordedActivity } from "@/tracking/types";
import type { WatchActivity, WatchProvider } from "./types";
import { recordUnmappedSport } from "./unmappedSports";

/**
 * WatchActivity → RecordedActivity. The one place a vendor's summary becomes
 * an ICEFALL record, and the one place every rule below is enforced.
 *
 * Every rule here exists to avoid inventing a figure the watch service did not
 * report. Nothing is derived, nothing is estimated, and nothing that would
 * read as a sensor reading is filled in from a guess.
 */

/* -------------------------------------------------------------------------- */
/* Sport                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Vendor sport value → ICEFALL's own activity type, per provider.
 *
 * ── THE RULE, WHICH DECIDES EVERY ENTRY BELOW ───────────────────────────────
 *
 * MAP ONLY WHERE THE VENDOR'S LABEL AND ICEFALL'S LABEL NAME THE SAME
 * ACTIVITY. Where ICEFALL's nearest type would add a qualifier the vendor
 * never stated — a surface, a discipline, indoors versus out — the entry is
 * left out and the activity lands on `"other"`. This is the same rule the
 * Strava map on the other side of this integration follows
 * (icefall-supabase/supabase/functions/strava/index.ts, the `SPORT` table):
 * filing an unfamiliar sport under the nearest-sounding type is a claim about
 * what the athlete did, not a formatting choice.
 *
 * The one licence the rule allows is ELIMINATION, and only when the vendor's
 * own catalogue makes it airtight: Suunto has separate ids for treadmill (53),
 * track (103) and trail (22) running, so its plain "Running" (1) genuinely is
 * the outdoor road-or-path run that ICEFALL calls `outdoor-run`. Where that
 * argument is used it is written beside the entry.
 *
 * ── WHAT FALLING THROUGH COSTS, AND WHY IT IS NO LONGER SILENT ──────────────
 *
 * An unmapped sport is not a disaster: the activity is still imported, with
 * every measured figure intact, as "Other". What used to be wrong is that the
 * miss was invisible — nobody could tell an activity ICEFALL had no word for
 * from one that genuinely had no category. Two things fix that now, both in
 * `watchActivityToRecorded` below: the vendor's own word is kept on the
 * record (`origin.vendorSport`), and the miss is added to a local list
 * (`unmappedSports.ts`) so the athlete can say which word is missing and the
 * next entry in this table can be written from a real value rather than a
 * guess.
 */
const SPORT_TO_TYPE: Record<WatchProvider, Record<string, ActivityTypeId>> = {
  /*
   * COROS — STILL EMPTY, AND NOT FOR WANT OF LOOKING.
   *
   * COROS publishes no response schema for `querySportRecords` at all, so
   * there is no `sport` field to key a table on yet, never mind values for it.
   * The server adapter returns `[]` deliberately (coros.ts) and the route now
   * refuses the call outright rather than letting an empty list read as
   * "nothing new" (index.ts, `reading_not_built`). Nothing can be written here
   * until somebody makes one authenticated `tools/list` call from a real COROS
   * account and reads the actual shape. Write the values in with the date they
   * were read, as suunto's are below.
   */
  coros: {},

  /*
   * POLAR — EMPTY BY CONSTRUCTION, WHICH IS A DIFFERENT PROBLEM FROM COROS'S.
   *
   * Read from Polar's own AccessLink Dynamic API v4 swagger
   * (https://www.polar.com/polar-api-v4/swagger.yaml, read 2026-09-11):
   *
   *   domainstrainingsessionSportReference:
   *     id: { type: string, example: "22353647432", maxLength: 36 }
   *
   * That is an opaque catalogue identifier, not an enumerable sport name —
   * there is no enum for it anywhere in the specification, and the same
   * document says so plainly elsewhere: "All available sports can be loaded
   * from the /v4/data/sports/list endpoint." So a static id → type table is
   * IMPOSSIBLE for Polar, not merely unwritten. (The earlier comment here said
   * the id→name table was unpublished. It is published; it is just a runtime
   * endpoint rather than a constant.)
   *
   * The finishable version: `GET /v4/data/sports/list` (scope `sports:read`,
   * which polar.ts does NOT currently request — see its SCOPE constant)
   * returns `sports[]`, each carrying the opaque `id`, a `name` documented as
   * "Sport identifier as string", localised display names, and a `parentSport`
   * that groups it ("hiking's parent sport is walking"). Resolve the id to
   * that stable `name` on the SERVER, put the name on the wire in place of the
   * id — still the vendor's own vocabulary, so the "never translated on the
   * server" rule in types.ts is untouched — and then this table can be keyed
   * by name the way suunto's is keyed by id.
   *
   * None of that can be tested today: ICEFALL holds no Polar credentials, so
   * `/watch/providers` reports polar as `needs-registration` and no import has
   * ever run. Writing the resolver blind, against a response nobody has seen
   * with a scope nobody has consented to, is the COROS mistake with different
   * spelling.
   */
  polar: {},

  /*
   * SUUNTO — FILLED FROM SUUNTO'S OWN PUBLISHED TABLE, read 2026-09-11.
   *
   * Source: "Suunto Activity IDs", the PDF linked from Suunto's public FIT
   * file description page (https://apizone.suunto.com/fit-description) at
   * https://aspartnercontent.blob.core.windows.net/apizone/docs/Activities.pdf
   * — 122 rows, each giving a sport name, its numeric sport id, and the FIT
   * sub-sport Suunto itself maps it to. It is reachable WITHOUT an APIzone
   * login, which is why this table can be written while the Suunto API
   * agreement is still unsigned. `suunto.ts` puts `workout.activityId` on the
   * wire as a decimal string, so these keys are decimal strings.
   *
   * Note this table cannot be exercised yet either — Suunto gates API access
   * behind a signed partner agreement, so no Suunto activity has ever reached
   * this function. It is written now because the evidence is public and
   * complete, and because the day approval lands nobody should have to find
   * this PDF again. Everything here is Suunto's own word, not an inference.
   *
   * DELIBERATE OMISSIONS, each because ICEFALL's nearest type would add a
   * claim Suunto did not make:
   *   0 Walking, 24 Nordic walking — ICEFALL has no walking type, and hiking
   *     is a different thing.
   *   3 Cross-country skiing, 56 Roller skiing, 117 Skate skiing, 118 Classic
   *     skiing — ICEFALL's `skiing` means downhill (its own Strava map sends
   *     it to `AlpineSki`), so cross-country would be filed as the wrong sport
   *     entirely.
   *   105 E-biking, 106 E-mtb — a motor changes what the training was; filing
   *     an e-MTB ride as `mountain-biking` overstates the effort.
   *   110 Splitboarding — the ascent is the point and `snowboarding` throws it
   *     away; ICEFALL has no splitboard type.
   *   59 Track and field — includes throws and jumps; `track-run` asserts
   *     running. 103 "Track running" is mapped instead, which does.
   *   82 Canoeing, 90 Snorkeling, 114 Cyclocross — no honest ICEFALL
   *     equivalent; `kayaking`, `swimming` and `gravel-cycling` would each be
   *     a different sport.
   *   17/20/23/32/54/63/73 and the other gym and ball entries — ICEFALL's
   *     catalogue has no strength or team-sport type at all. These are the
   *     honest "other", and they are the ones most likely to show up in the
   *     unmapped list; that is correct, not a bug to be papered over.
   */
  suunto: {
    // Running. 53, 103 and 22 having their own ids is what makes 1 "outdoor".
    "1": "outdoor-run", // Running
    "22": "trail-run", // Trail running
    "53": "treadmill-run", // Treadmill
    "103": "track-run", // Track running (sub-sport TRACK)
    "115": "trail-run", // Vertical running — Suunto's own sub-sport is RUNNING/TRAIL

    // Cycling. 10, 52 and 99 having their own ids is what makes 2 "road".
    "2": "road-cycling", // Cycling
    "10": "mountain-biking", // Mountain biking
    "52": "indoor-cycling", // Indoor cycling
    "99": "gravel-cycling", // Gravel cycling

    // On foot in the mountains.
    "11": "hiking", // Hiking
    "70": "trekking", // Trekking
    "83": "mountaineering", // Mountaineering
    "65": "snowshoeing", // Snow shoeing

    // Climbing. Suunto maps its single "Climbing" to FIT ROCK_CLIMBING itself,
    // so this is Suunto's statement rather than ICEFALL's reading of it.
    "29": "rock-climbing", // Climbing

    // Snow. 13 and 84 are both ALPINE_SKIING/DOWNHILL in Suunto's own mapping.
    "13": "skiing", // Downhill skiing
    "84": "skiing", // Telemark skiing
    "30": "snowboarding", // Snowboarding
    "31": "ski-touring", // Ski touring
    "107": "ski-touring", // Backcountry skiing
    "116": "ski-mountaineering", // Ski mountaineering

    // Water.
    "21": "swimming", // Swimming
    "85": "swimming", // Openwater swimming
    "72": "kayaking", // Kayaking
    "61": "paddleboarding", // Standup paddling
  },

  /*
   * GARMIN — no adapter exists, so nothing can arrive to be mapped. Two
   * blockers, both outside ICEFALL's control and both recorded in full in
   * icefall-supabase/supabase/functions/watch/registry.ts: there is no
   * application form on Garmin's site (email only), and Garmin delivers
   * activities only by PUSHING them to a pre-approved webhook, which this app
   * does not run. The activity-type enum is inside the gated developer portal
   * and has not been read. Leave empty.
   */
  garmin: {},
};

/* -------------------------------------------------------------------------- */
/* Tracks and altitude                                                         */
/* -------------------------------------------------------------------------- */

/**
 * WHY AN IMPORTED ACTIVITY STILL HAS NO TRACK AND NO ALTITUDE SERIES —
 * per vendor, because the four reasons are genuinely different and one
 * sentence for all of them would be false for at least two.
 *
 * COROS. Nothing is known. There is no published response schema for
 *   `querySportRecords`, so there is no summary shape either, never mind a
 *   track. COROS does expose `queryActivityFitFileDownloadUrls` /
 *   `downloadActivityFitFiles`, which would carry a full track and a
 *   barometric altitude series — but it is quota'd at 50 files per account per
 *   day and needs a FIT parser in the app, and coros.ts rules it out for v1
 *   for exactly those reasons. Unchanged here.
 *
 * POLAR. DOCUMENTED, AND NOT REACHABLE. Polar v4's
 *   `GET /v4/data/training-sessions/list` takes a `features` parameter whose
 *   documented values include `routes`, `samples` and `statistics`
 *   (swagger.yaml, read 2026-09-11). With `routes`, each exercise carries
 *   `routes.route.wayPoints[]`, and each waypoint is
 *   `{ latitude, longitude, altitude, elapsedMillis }` with `altitude`
 *   REQUIRED and in metres — a real track with a real altitude series. With
 *   `statistics`, `exercises[].statistics.statistics[]` includes an entry of
 *   type `STATISTICS_TYPE_ALTITUDE` carrying `min`, `avg` and `max`, which is
 *   exactly `minAltitudeM` / `maxAltitudeM` below, measured rather than
 *   derived.
 *
 *   THE COST, and why this is not simply switched on: Polar's own description
 *   of that endpoint is explicit — "When no features are in use, date range
 *   can be 90 days. If features are used, only one day at a time can be
 *   requested." Asking for a track therefore collapses the import window from
 *   90 days to 1, turning a single catch-up call into ninety, and there is no
 *   per-session endpoint in v4 to fetch a track for one activity after the
 *   fact (`/training-sessions/list` is the only training-session path in the
 *   whole specification). That trade is a real design decision — most likely a
 *   summary-only sweep plus an on-demand per-day fetch for one activity the
 *   athlete asks to see on a map — and it cannot be tested against anything
 *   today, because ICEFALL holds no Polar credentials and polar reports
 *   `needs-registration`. Written down rather than built blind.
 *
 * SUUNTO. Unknown, and the unknown is the parameters rather than the shape.
 *   suunto.ts sends NO query parameters to `/v2/workouts` because their names
 *   are not published outside APIzone; the same is true of whatever would ask
 *   for samples or a route. Suunto does publish a `/v2/workout/exportFit/{id}`
 *   style FIT export in its partner docs, but that is behind the same signed
 *   agreement that blocks the rest of the integration.
 *
 * GARMIN. No adapter, so the question does not arise yet.
 *
 * The consequence, enforced below: `points` is `[]`, every altitude figure is
 * `null`, and `capabilities.gps` / `barometricAltitude` are false — for every
 * provider, today. None of those is a guess; each is the absence of a reading.
 * The settings screen says the same thing in words ("It does not bring the GPS
 * track, so an imported activity draws no map"), and that sentence and this
 * comment must be changed in the same edit.
 */

export function watchActivityToRecorded(
  w: WatchActivity,
  provider: WatchProvider,
): RecordedActivity {
  /*
   * THE FALLTHROUGH, MADE VISIBLE.
   *
   * `?? "other"` on its own was a silent failure: an athlete saw "Other" and
   * could not tell whether ICEFALL had no word for their sport or whether the
   * sport genuinely had no category. The miss is now recorded locally (so it
   * can be reported and the table finished from a real value) and the vendor's
   * own word is kept on the record below.
   */
  const mapped = SPORT_TO_TYPE[provider][w.sport];
  const activityTypeId: ActivityTypeId = mapped ?? "other";
  if (!mapped) recordUnmappedSport(provider, w.sport, w.providerActivityId);

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
    /*
     * THE VENDOR'S OWN OFFSET, WHICH ICEFALL USED TO THROW AWAY.
     *
     * `WatchActivity.utcOffsetMinutes` has always been on the wire and nothing
     * read it, so an activity imported from a trip abroad was re-read in
     * whatever zone the phone happened to be in — see `tracking/timeOfDay.ts`
     * for why that is not a cosmetic problem. It is carried through as the
     * vendor gave it and is null when the vendor did not say, in which case the
     * local clock for this session is simply unknown and stays unknown.
     *
     * No zone NAME: none of the four vendors sends one. `measured` is honest
     * even for a `vendorEntered` activity — the athlete's watch app stamped the
     * clock, which is a different question from whether it measured the
     * distance.
     */
    startUtcOffsetMin: w.utcOffsetMinutes,
    startTimeZone: null,
    startTimeSource: "measured",
    simulated: false,

    origin: {
      kind: "imported",
      provider,
      providerActivityId: w.providerActivityId,
      deviceName: w.deviceName,
      importedAt: new Date().toISOString(),
      vendorEntered: w.vendorEntered,
      movingSecMeasured,
      /* The vendor's own word, verbatim, and null when it sent none — never
         back-filled from `activityTypeId`, which would turn ICEFALL's own
         reading into evidence about what the watch said. */
      vendorSport: w.sport === "" ? null : w.sport,
    },

    durationSec: w.durationSec,
    // NOT a measurement when the vendor gave one duration only — the flag on
    // `origin` above is what stops this number being displayed as one.
    movingSec: w.movingSec ?? w.durationSec,
    distanceM: w.distanceM ?? 0,
    elevationGainM: w.elevationGainM ?? 0,
    elevationLossM: w.elevationLossM ?? 0,
    // None of these are derivable from a summary with no track. Null, not a
    // computed guess. See the tracks-and-altitude note above for what each
    // vendor does and does not publish — Polar's altitude extremes are
    // documented and unreachable; the rest are not documented at all.
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

    // v1 imports NO TRACK, from any of the four. See the note above.
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
