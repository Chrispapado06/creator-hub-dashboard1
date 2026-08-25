import type { ActivityFamily, ActivityType, ActivityTypeId } from "./types";

/**
 * The activity catalogue.
 *
 * Activity type is not a label — it decides which metrics the live screen
 * prioritises, how aggressively GPS is filtered, and whether the layout is
 * built around distance or around vertical.
 */

const RUN_METRICS = [
  "distance",
  "duration",
  "pace",
  "avgPace",
  "elevationGain",
  "heartRate",
  "cadence",
  "calories",
] as const;

const HIKE_METRICS = [
  "distance",
  "elevationGain",
  "duration",
  "elevationLoss",
  "altitude",
  "verticalRate",
  "pace",
  "movingTime",
  "heartRate",
  "temperature",
] as const;

const CYCLE_METRICS = [
  "distance",
  "speed",
  "duration",
  "avgSpeed",
  "elevationGain",
  "heartRate",
  "cadence",
  "power",
  "calories",
] as const;

const ALPINE_METRICS = [
  "altitude",
  "elevationGain",
  "verticalRate",
  "distance",
  "duration",
  "movingTime",
  "elevationLoss",
  "maxAltitude",
  "grade",
  "heartRate",
  "temperature",
  "objectiveProgress",
] as const;

const CLIMB_METRICS = [
  "verticalGain",
  "duration",
  "altitude",
  "heartRate",
  "calories",
  "movingTime",
] as const;

const WINTER_METRICS = [
  "distance",
  "elevationGain",
  "duration",
  "elevationLoss",
  "altitude",
  "speed",
  "verticalRate",
  "heartRate",
  "temperature",
] as const;

const WATER_METRICS = [
  "distance",
  "duration",
  "speed",
  "avgSpeed",
  "heartRate",
  "calories",
] as const;

const INDOOR_METRICS = [
  "duration",
  "heartRate",
  "calories",
  "cadence",
  "power",
  "movingTime",
] as const;

type M = ActivityType["metrics"];

function make(
  id: ActivityTypeId,
  family: ActivityFamily,
  label: string,
  hint: string,
  metrics: readonly string[],
  opts: Partial<
    Pick<ActivityType, "indoor" | "maxSpeedMps" | "verticalFocus" | "metEstimate">
  > = {},
): ActivityType {
  return {
    id,
    family,
    label,
    hint,
    metrics: metrics as unknown as M,
    indoor: opts.indoor ?? false,
    maxSpeedMps: opts.maxSpeedMps ?? 8,
    verticalFocus: opts.verticalFocus ?? false,
    metEstimate: opts.metEstimate ?? 8,
  };
}

export const ACTIVITY_TYPES: ActivityType[] = [
  // ---- Running -----------------------------------------------------------
  make("outdoor-run", "running", "Outdoor Run", "Road and path", RUN_METRICS, {
    maxSpeedMps: 8,
    metEstimate: 10,
  }),
  make("trail-run", "running", "Trail Run", "Technical terrain", RUN_METRICS, {
    maxSpeedMps: 7,
    metEstimate: 11,
  }),
  make("treadmill-run", "running", "Treadmill Run", "Indoor — no GPS", INDOOR_METRICS, {
    indoor: true,
    metEstimate: 10,
  }),
  make("track-run", "running", "Track Run", "Measured laps", RUN_METRICS, {
    maxSpeedMps: 10,
    metEstimate: 11,
  }),

  // ---- Hiking ------------------------------------------------------------
  make("hiking", "hiking", "Hiking", "Trails and hills", HIKE_METRICS, {
    maxSpeedMps: 4,
    metEstimate: 6,
  }),
  make("fast-hiking", "hiking", "Fast Hiking", "Sustained pace", HIKE_METRICS, {
    maxSpeedMps: 5,
    metEstimate: 7.5,
  }),
  make("trekking", "hiking", "Trekking", "Multi-day terrain", HIKE_METRICS, {
    maxSpeedMps: 4,
    metEstimate: 7,
  }),
  make("backpacking", "hiking", "Backpacking", "Under a full load", HIKE_METRICS, {
    maxSpeedMps: 3.5,
    metEstimate: 8,
  }),

  // ---- Cycling -----------------------------------------------------------
  make("road-cycling", "cycling", "Road Cycling", "Tarmac", CYCLE_METRICS, {
    maxSpeedMps: 25,
    metEstimate: 8,
  }),
  make("mountain-biking", "cycling", "Mountain Biking", "Off-road", CYCLE_METRICS, {
    maxSpeedMps: 20,
    metEstimate: 10,
  }),
  make("gravel-cycling", "cycling", "Gravel Cycling", "Mixed surface", CYCLE_METRICS, {
    maxSpeedMps: 22,
    metEstimate: 9,
  }),
  make("indoor-cycling", "cycling", "Indoor Cycling", "Trainer — no GPS", INDOOR_METRICS, {
    indoor: true,
    metEstimate: 8,
  }),

  // ---- Mountaineering ----------------------------------------------------
  make("mountaineering", "mountaineering", "Mountaineering", "Glacier and snow", ALPINE_METRICS, {
    maxSpeedMps: 3,
    verticalFocus: true,
    metEstimate: 9,
  }),
  make("alpine-climbing", "mountaineering", "Alpine Climbing", "Technical alpine", ALPINE_METRICS, {
    maxSpeedMps: 2.5,
    verticalFocus: true,
    metEstimate: 9.5,
  }),
  make("scrambling", "mountaineering", "Scrambling", "Hands-on ridge", ALPINE_METRICS, {
    maxSpeedMps: 3,
    verticalFocus: true,
    metEstimate: 8,
  }),
  make(
    "ski-mountaineering",
    "mountaineering",
    "Ski Mountaineering",
    "Skin and summit",
    ALPINE_METRICS,
    { maxSpeedMps: 15, verticalFocus: true, metEstimate: 10 },
  ),

  // ---- Climbing ----------------------------------------------------------
  make("rock-climbing", "climbing", "Rock Climbing", "Outdoor rock", CLIMB_METRICS, {
    maxSpeedMps: 2,
    verticalFocus: true,
    metEstimate: 8,
  }),
  make("indoor-climbing", "climbing", "Indoor Climbing", "Gym — no GPS", INDOOR_METRICS, {
    indoor: true,
    verticalFocus: true,
    metEstimate: 7.5,
  }),
  make("bouldering", "climbing", "Bouldering", "Short and hard", INDOOR_METRICS, {
    indoor: true,
    verticalFocus: true,
    metEstimate: 7,
  }),

  // ---- Winter ------------------------------------------------------------
  make("skiing", "winter", "Skiing", "Downhill", WINTER_METRICS, {
    maxSpeedMps: 30,
    metEstimate: 7,
  }),
  make("ski-touring", "winter", "Ski Touring", "Earn your turns", WINTER_METRICS, {
    maxSpeedMps: 15,
    verticalFocus: true,
    metEstimate: 9,
  }),
  make("snowboarding", "winter", "Snowboarding", "Downhill", WINTER_METRICS, {
    maxSpeedMps: 28,
    metEstimate: 7,
  }),
  make("snowshoeing", "winter", "Snowshoeing", "Deep snow", WINTER_METRICS, {
    maxSpeedMps: 3,
    metEstimate: 8,
  }),

  // ---- Water -------------------------------------------------------------
  make("kayaking", "water", "Kayaking", "Flat and moving water", WATER_METRICS, {
    maxSpeedMps: 6,
    metEstimate: 5,
  }),
  make("paddleboarding", "water", "Paddleboarding", "Standing paddle", WATER_METRICS, {
    maxSpeedMps: 5,
    metEstimate: 6,
  }),
  make("swimming", "water", "Swimming", "Open water", WATER_METRICS, {
    maxSpeedMps: 3,
    metEstimate: 8,
  }),

  // ---- Other -------------------------------------------------------------
  make(
    "other",
    "other",
    "Other Activity",
    "Anything else",
    ["duration", "distance", "elevationGain", "heartRate", "calories", "movingTime"],
    { maxSpeedMps: 15, metEstimate: 6 },
  ),
];

export const FAMILY_LABELS: Record<ActivityFamily, string> = {
  running: "Running",
  hiking: "Hiking",
  cycling: "Cycling",
  mountaineering: "Mountaineering",
  climbing: "Climbing",
  winter: "Winter",
  water: "Water",
  other: "Other",
};

export const FAMILY_ORDER: ActivityFamily[] = [
  "running",
  "hiking",
  "cycling",
  "mountaineering",
  "climbing",
  "winter",
  "water",
  "other",
];

export const activityById = (id: ActivityTypeId): ActivityType =>
  ACTIVITY_TYPES.find((a) => a.id === id) ?? ACTIVITY_TYPES[0];

export const activitiesInFamily = (f: ActivityFamily) =>
  ACTIVITY_TYPES.filter((a) => a.family === f);
