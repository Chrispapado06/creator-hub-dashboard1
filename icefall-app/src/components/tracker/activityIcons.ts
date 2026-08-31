import {
  Activity,
  Backpack,
  Bike,
  Dumbbell,
  Footprints,
  Gauge,
  Milestone,
  Mountain,
  MountainSnow,
  Repeat,
  Route,
  Sailboat,
  Snowflake,
  Target,
  Timer,
  TreePine,
  TrendingUp,
  Waves,
  Wind,
} from "lucide-react";
import type { ActivityFamily, ActivityTypeId } from "@/tracking/types";
import type { SportMode } from "@/types";

/**
 * One icon per activity type, not per family.
 *
 * Four running variants sharing a single bolt made the list unreadable — you
 * could not tell at a glance which row was the treadmill and which was the
 * trail. Icons live here rather than in `tracking/activities.ts` so the data
 * layer stays free of React.
 */
/**
 * PH-02 — one icon per SPORT MODE, for the history list.
 *
 * `ACTIVITY_ICON` below is keyed by the specific activity TYPE a recording was
 * made with (four running variants, each distinct). A history row only knows
 * the coarser `SportMode`, so it needs its own map rather than a lookup that
 * cannot be satisfied. The owner asked for "an icon or image if activity is
 * running, hiking etc" — this is that, at the granularity the row actually has.
 */
export const MODE_ICON: Record<SportMode, typeof Mountain> = {
  hiking: Footprints,
  running: Route,
  climbing: Target,
  mountaineering: MountainSnow,
  cycling: Bike,
  "ski-touring": Snowflake,
};

export const ACTIVITY_ICON: Record<ActivityTypeId, typeof Mountain> = {
  // Running
  "outdoor-run": Route,
  "trail-run": TreePine,
  "treadmill-run": Timer,
  "track-run": Repeat,

  // Hiking
  hiking: Footprints,
  "fast-hiking": TrendingUp,
  trekking: Milestone,
  backpacking: Backpack,

  // Cycling
  "road-cycling": Bike,
  "mountain-biking": Mountain,
  "gravel-cycling": Route,
  "indoor-cycling": Gauge,

  // Mountaineering
  mountaineering: MountainSnow,
  "alpine-climbing": Mountain,
  scrambling: TrendingUp,
  "ski-mountaineering": Snowflake,

  // Climbing
  "rock-climbing": Mountain,
  "indoor-climbing": Dumbbell,
  bouldering: Target,

  // Winter
  skiing: Snowflake,
  "ski-touring": Wind,
  snowboarding: Snowflake,
  snowshoeing: Footprints,

  // Water
  kayaking: Sailboat,
  paddleboarding: Waves,
  swimming: Waves,

  other: Activity,
};

export const FAMILY_ICON: Record<ActivityFamily, typeof Mountain> = {
  running: Route,
  hiking: Footprints,
  cycling: Bike,
  mountaineering: MountainSnow,
  climbing: Mountain,
  winter: Snowflake,
  water: Waves,
  other: Activity,
};
