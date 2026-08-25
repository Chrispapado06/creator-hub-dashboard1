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

/**
 * One icon per activity type, not per family.
 *
 * Four running variants sharing a single bolt made the list unreadable — you
 * could not tell at a glance which row was the treadmill and which was the
 * trail. Icons live here rather than in `tracking/activities.ts` so the data
 * layer stays free of React.
 */
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
