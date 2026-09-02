/**
 * ICEFALL domain model.
 *
 * Every screen reads from these shapes only. The mock repositories in
 * `src/services` are the single seam where real APIs replace fixtures —
 * no screen imports `src/data` directly.
 */

export type Discipline =
  | "hiking"
  | "trail-running"
  | "climbing"
  | "mountaineering"
  | "ski-touring"
  | "alpine-expedition";

export type SportMode =
  | "hiking"
  | "running"
  | "climbing"
  | "mountaineering"
  | "cycling"
  | "ski-touring";

export type ExperienceLevel = "new" | "developing" | "experienced" | "advanced";

/** 1 = accessible, 5 = extreme. Used consistently for routes, days and events. */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type Season = "spring" | "summer" | "autumn" | "winter";

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export interface TrackPoint {
  /** Normalised 0..1 position within the route's bounding box. */
  x: number;
  y: number;
  /** Metres above sea level. */
  ele: number;
  /** Seconds from activity start. */
  t: number;
  hr?: number;
}

export interface Split {
  km: number;
  durationSec: number;
  elevationGainM: number;
  hr?: number;
}

export interface Conditions {
  tempC: number;
  /**
   * OPTIONAL, BECAUSE A PHONE DOES NOT MEASURE WIND.
   *
   * A recorded activity used to arrive here with `windKph: 0`, which the strip
   * printed as "0 km/h" — a still day, stated as fact, on every activity the
   * recorder produced. Nothing on the device can read wind speed. Absent now
   * means absent, and the strip leaves the segment out rather than inventing a
   * calm one.
   */
  windKph?: number;
  summary: string;
  /**
   * Lucide-ish descriptor the WeatherStrip maps to an icon. `device` is the
   * honest option for a recording that carries a thermometer reading and no
   * observation of the sky — the old fallback drew a cloud, which is a claim
   * about cloud cover nobody made.
   */
  icon: "clear" | "cloud" | "snow" | "rain" | "wind" | "storm" | "device";
  visibilityKm?: number;
}

export interface Activity {
  id: string;
  mode: SportMode;
  title: string;
  location: string;
  /** ISO 8601. */
  startedAt: string;
  durationSec: number;
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  /** Seconds per kilometre. Absent when there was no usable GPS. */
  avgPaceSecPerKm?: number;
  avgHr?: number;
  maxHr?: number;
  calories?: number;
  /** Absent when conditions weren't recorded — never faked as 0 °C. */
  conditions?: Conditions;
  track: TrackPoint[];
  splits: Split[];
  /** One concise line from ICEFALL Coach. Never more than two sentences. */
  insight?: string;
  photo?: string;
  /**
   * The activity came from the position SIMULATOR, not a sensor.
   *
   * Carried through from `RecordedActivity` so consumers can exclude it. A
   * simulated session is not training and must never reach a total, a personal
   * best, an achievement or a training-load figure — it would tell an athlete
   * they are fitter than they are, before a mountain.
   */
  simulated?: boolean;
}

// ---------------------------------------------------------------------------
// Goals & training
// ---------------------------------------------------------------------------

export interface Goal {
  id: string;
  /** Free text so custom objectives are first-class. */
  name: string;
  subtitle?: string;
  elevationM?: number;
  mountainId?: string;
  /** ISO date. */
  targetDate: string;
  /** When the build began. Anchors week 1 of the generated plan. */
  trainingStartedAt?: string;
  /** 0..100 — derived from training completion, not user-set. */
  preparation: number;
  status: "active" | "completed";
  completedAt?: string;
  photo?: string;
  /** OSM `wikipedia` tag (`en:Ama Dablam`) — resolves the peak's photograph. */
  wikipedia?: string;
  /** Kept so the goal page can brief on the mountain: latitude sets the season
   *  window, country sets the permit authority. */
  lat?: number;
  lon?: number;
  country?: string;
  /** What still stands between the athlete and the summit. */
  gaps?: string[];
}

export type TrainingFocus =
  | "recovery"
  | "endurance"
  | "strength"
  | "intervals"
  | "long-mountain"
  | "rest"
  | "technical";

export interface TrainingDay {
  /** ISO date. */
  date: string;
  focus: TrainingFocus;
  title: string;
  detail?: string;
  distanceKm?: number;
  elevationM?: number;
  durationMin?: number;
  difficulty: Difficulty;
  completed: boolean;
}

export interface TrainingWeek {
  index: number;
  /** e.g. "Base 3" / "Peak 1" — the block this week belongs to. */
  block: string;
  startDate: string;
  days: TrainingDay[];
}

export interface TrainingPlan {
  id: string;
  goalId: string;
  title: string;
  totalWeeks: number;
  currentWeek: number;
  weeks: TrainingWeek[];
}

// ---------------------------------------------------------------------------
// Mountains, routes, expeditions
// ---------------------------------------------------------------------------

export interface MountainRoute {
  name: string;
  difficulty: Difficulty;
  gradeLabel: string;
  durationLabel: string;
  distanceKm: number;
  elevationGainM: number;
  description: string;
}

export interface Mountain {
  id: string;
  /** Real summit coordinates, used to centre the terrain map. */
  coords: { lat: number; lon: number };
  name: string;
  range: string;
  country: string;
  elevationM: number;
  difficulty: Difficulty;
  difficultyLabel: string;
  bestSeasons: Season[];
  typicalDurationLabel: string;
  technicalRequirements: string[];
  requiredExperience: string;
  trainingRequirements: string[];
  recommendedGearIds: string[];
  routes: MountainRoute[];
  conditions: Conditions;
  /**
   * True where the climbing permit is issued to an EXPEDITION OR OPERATOR
   * rather than to a person.
   *
   * This is a regulatory fact about the mountain, not a difficulty rating, and
   * it is the thing that actually decides whether hiring an individual guide
   * is an option at all. It does not track altitude: Nepal and Pakistan issue
   * 8,000 m permits to a named expedition, and Tanzania requires Kilimanjaro
   * at 5,895 m to be climbed with a licensed operator — while Aconcagua at
   * 6,961 m is permitted to the individual climber.
   *
   * The guides directory uses it to say "a company is the way in" instead of
   * offering a peak nobody can be hired for directly.
   */
  permitIssuedToOperator?: true;
  photo: string;
  /**
   * Attribution for `photo`, when ICEFALL did not take it.
   *
   * REQUIRED FOR ANY CC BY / CC BY-SA IMAGE, which is most of the newer ones —
   * those licences oblige us to name the photographer wherever the work is
   * shown. Leaving it undefined is not neutral: `MountainImage` falls back to
   * "<name> — ICEFALL photography", so an uncredited borrowed photograph does
   * not merely go unattributed, it gets actively claimed as ours.
   */
  photoCredit?: string;
  summary: string;
  /** True when the objective genuinely needs a certified guide or operator. */
  requiresProfessionalSupport: boolean;
}

export interface ExpeditionOperator {
  name: string;
  certification: string;
  /** ICEFALL is a discovery layer — bookings resolve to the operator. */
  website?: string;
}

export interface Expedition {
  id: string;
  mountainId: string;
  name: string;
  elevationM: number;
  durationLabel: string;
  difficulty: Difficulty;
  difficultyLabel: string;
  requiredExperience: string;
  priceFromEur: number;
  seasons: string[];
  operators: ExpeditionOperator[];
  prerequisites: string[];
  photo: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export interface Macros {
  carbsG: number;
  proteinG: number;
  fatG: number;
}

export interface Meal {
  id: string;
  name: string;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  calories: number;
  macros: Macros;
  detail: string;
  photo?: string;
  loggedAt: string;
}

export interface NutritionDay {
  date: string;
  calorieTarget: number;
  macroTarget: Macros;
  hydrationTargetMl: number;
  hydrationMl: number;
  meals: Meal[];
  insight: string;
}

// ---------------------------------------------------------------------------
// Gear
// ---------------------------------------------------------------------------

export type GearCategory =
  | "shell"
  | "insulation"
  | "midlayer"
  | "base"
  | "pants"
  | "pack"
  | "accessory";

export interface Product {
  id: string;
  name: string;
  category: GearCategory;
  categoryLabel: string;
  priceEur: number;
  photo: string;
  /** Why ICEFALL recommends it for the current objective. */
  rationale: string;
  tempRangeC: [number, number];
  protection: string[];
  specs: { label: string; value: string }[];
  suitableFor: SportMode[];
  weightG: number;
}

export interface GearSystem {
  id: string;
  mountainId: string;
  title: string;
  summary: string;
  productIds: string[];
}

// ---------------------------------------------------------------------------
// Community & events
// ---------------------------------------------------------------------------

export interface CommunityPost {
  id: string;
  author: { name: string; avatar: string; level: number };
  postedAt: string;
  location: string;
  body: string;
  photo?: string;
  /** Achievement-first: the summit or stat matters more than the caption. */
  achievement?: { label: string; value: string };
  kudos: number;
  comments: number;
}

export interface Challenge {
  id: string;
  title: string;
  detail: string;
  metricLabel: string;
  progress: number;
  target: number;
  unit: string;
  endsOn: string;
  participants: number;
  photo: string;
}

export interface CommunityGroup {
  id: string;
  name: string;
  detail: string;
  members: number;
  photo: string;
}

export interface IcefallEvent {
  id: string;
  title: string;
  kind: "training" | "workshop" | "talk" | "expedition" | "private";
  location: string;
  country: string;
  /** ISO date. */
  date: string;
  durationLabel: string;
  difficulty: Difficulty;
  capacity: number;
  spotsLeft: number;
  priceEur: number | null;
  requirements: string[];
  summary: string;
  photo: string;
  privateOnly: boolean;
}

// ---------------------------------------------------------------------------
// Athlete
// ---------------------------------------------------------------------------

export interface Achievement {
  id: string;
  name: string;
  detail: string;
  earnedAt?: string;
  /** Locked achievements still render — they are the ladder. */
  locked: boolean;
}

export interface Summit {
  mountainId: string;
  name: string;
  elevationM: number;
  date: string;
}

export interface AthleteStats {
  activities: number;
  distanceKm: number;
  elevationM: number;
  timeHours: number;
  summits: number;
}

export interface User {
  name: string;
  avatar: string;
  /* `level` / `xp` / `xpToNext` are GONE, not zeroed — see PH-22. There is no
     XP engine in this app: nothing awards it, nothing spends it, and the curve
     those numbers implied was never designed. After points were removed (D5)
     the DEV fixture's Level 24 was the only progression figure left in any
     build, which is a claim about what the athlete has done with nothing
     behind it. The type no longer has room for the claim. */
  experience: ExperienceLevel;
  disciplines: Discipline[];
  homeBase: string;
  memberSince: string;
  stats: AthleteStats;
  summits: Summit[];
  achievements: Achievement[];
  privateMember: boolean;
  /** Set once onboarding completes; gates the splash → onboarding → home flow. */
  onboarded: boolean;
}

export interface WeeklyProgress {
  distanceKm: number;
  activities: number;
  timeHours: number;
  elevationM: number;
  /** Seven values, Monday-first, used by the dashboard sparkline. */
  daily: number[];
}

// ---------------------------------------------------------------------------
// Coach
// ---------------------------------------------------------------------------

export interface CoachMessage {
  id: string;
  role: "coach" | "athlete";
  body: string;
  at: string;
  /** Rendered as a caution strip beneath the bubble. */
  disclaimer?: string;
}
