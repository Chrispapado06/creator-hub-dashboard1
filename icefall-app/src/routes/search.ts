import { haversine } from "@/tracking/filters";
import { sync } from "@/services/repository";
import { allRoutes, type Route } from "@/routes/model";
import type { Place } from "@/routes/places";

/**
 * Search by WHERE YOU ARE and WHAT YOU WANT TO DO.
 *
 * Not a free-text route box. Nobody opens an outdoor app knowing the name of
 * the line they want — they know roughly where they are and whether they are
 * going for a run, a walk or a mountain. So the search takes a place (anywhere
 * on earth, see `places.ts`) and an activity, and everything else filters on top.
 */

/* -------------------------------------------------------------------------- */
/* What you want to do                                                        */
/* -------------------------------------------------------------------------- */

export type ActivityKind = "mountaineering" | "hiking" | "running";

export interface ActivityOption {
  id: ActivityKind;
  label: string;
  /** Plain-language description of what this filter actually does. */
  detail: string;
}

export const ACTIVITY_OPTIONS: ActivityOption[] = [
  { id: "mountaineering", label: "Mountaineering", detail: "Graded alpine lines and summit routes" },
  { id: "hiking", label: "Hiking", detail: "Non-technical ground, walking pace" },
  { id: "running", label: "Trail running", detail: "Shorter, runnable ground" },
];

export const activityOption = (id: ActivityKind) =>
  ACTIVITY_OPTIONS.find((a) => a.id === id) ?? ACTIVITY_OPTIONS[0];

/**
 * Walking grades versus alpine grades.
 *
 * This is the line the athlete actually cares about, and it is a real one: a
 * trek, a scramble or a via ferrata is ground you walk and climb with your
 * hands; F, PD, AD, ED and "Expedition" are the alpine system, which starts at
 * rope, axe and crampons. Gran Paradiso's normal route is graded **F+** and
 * looks easy by number — it is still a glacier, and it is not a hike.
 */
const WALKING_GRADE = /^(trek|hike|walk|scramble|ferrata|via ferrata|trail)/i;

const isWalkingRoute = (route: Route) => WALKING_GRADE.test(route.gradeLabel.trim());

/**
 * Whether a route belongs to an activity — STRICTLY. No route appears under two
 * activities: picking "Hiking" and being shown the Hörnli Ridge is not a
 * generous result, it is a category error with consequences.
 */
function matchesActivity(route: Route, activity: ActivityKind): boolean {
  const walking = isWalkingRoute(route);
  switch (activity) {
    case "mountaineering":
      // Roped, glaciated or graded ground. Nothing you merely walk up.
      return !walking;
    case "hiking":
      return walking;
    case "running":
      return (
        walking && route.elevationGainM <= 1200 && !route.multiDay && route.difficulty <= 2
      );
  }
}

/**
 * The terrain bands each activity covers, using the app's own peak assessment
 * (1 hill walk <1,000 m · 2 mountain hike <2,000 · 3 demanding mountain day
 * <2,900 · 4 alpine snow and glacier <3,600 · 5 serious alpine <4,500 ·
 * 6 high altitude <6,000 · 7 extreme altitude).
 *
 * ── Why mountaineering starts at band 3, not band 4 ──────────────────────────
 *
 * It used to start at 4, which begins at 2,900 m. Measured against Slovakia:
 * **0 peaks qualified**, because the High Tatras top out at Gerlachovský štít,
 * 2,655 m — so a search from a country full of alpine granite returned an empty
 * screen. The same threshold also excluded Triglav (2,864 m), one of ICEFALL's
 * OWN curated mountaineering objectives, and with it most of the Julian Alps,
 * the Tatras, the Scottish Highlands and the lower Pyrenees.
 *
 * 2,900 m is a threshold that only makes sense in the Western Alps. Mountaineering
 * is defined by the ground, not by an altitude that happens to suit Chamonix.
 *
 * Still strictly non-overlapping: nothing appears under two activities.
 */
export const ACTIVITY_BANDS: Record<ActivityKind, { min: number; max: number }> = {
  // Hiking's real answer is the trail list; peaks here are the hills you walk up.
  hiking: { min: 1, max: 2 },
  mountaineering: { min: 3, max: 7 },
  running: { min: 1, max: 2 },
};

export interface RouteHit extends Route {
  /** Straight-line km from the chosen place to the summit. */
  distanceFromBaseKm: number;
}

export interface SearchArgs {
  base: Pick<Place, "lat" | "lon">;
  activity: ActivityKind;
  /** Straight-line radius. `null` searches everywhere. */
  radiusKm: number | null;
  query?: string;
}

/**
 * The search. Returns documented routes within the radius of the chosen place,
 * matching the activity, nearest first.
 */
export function searchRoutes(args: SearchArgs): RouteHit[] {
  const q = args.query?.trim().toLowerCase();

  return allRoutes()
    .map((r) => {
      const m = sync.mountainById(r.mountainId);
      const km = m ? haversine(args.base, m.coords) / 1000 : Number.POSITIVE_INFINITY;
      return { ...r, distanceFromBaseKm: km };
    })
    .filter((r) => Number.isFinite(r.distanceFromBaseKm))
    .filter((r) => (args.radiusKm === null ? true : r.distanceFromBaseKm <= args.radiusKm))
    .filter((r) => matchesActivity(r, args.activity))
    .filter((r) =>
      q ? `${r.name} ${r.mountainName} ${r.range} ${r.country}`.toLowerCase().includes(q) : true,
    )
    .sort((a, b) => a.distanceFromBaseKm - b.distanceFromBaseKm);
}

/**
 * The nearest documented route of any kind, so an empty result can say how far
 * away the catalogue actually starts instead of just "nothing found".
 */
export function nearestRoute(base: Pick<Place, "lat" | "lon">): RouteHit | null {
  const all = searchRoutes({ base, activity: "hiking", radiusKm: null });
  const every = allRoutes()
    .map((r) => {
      const m = sync.mountainById(r.mountainId);
      return { ...r, distanceFromBaseKm: m ? haversine(base, m.coords) / 1000 : Infinity };
    })
    .filter((r) => Number.isFinite(r.distanceFromBaseKm))
    .sort((a, b) => a.distanceFromBaseKm - b.distanceFromBaseKm);
  return every[0] ?? all[0] ?? null;
}

/** Radius choices, in km. `null` = anywhere. */
/**
 * Every radius the search can actually honour.
 *
 * The list used to offer 300 km, 1000 km and "Anywhere", and none of the three
 * did anything: both searches clamped internally, so picking "Anywhere" quietly
 * meant thirty kilometres of trails. Measured against Overpass around a dense
 * range, one query costs ~9 s at 100 km and ~31 s at 150 km — so a hundred is
 * the honest ceiling, and the options stop where the search does.
 */
export const RADIUS_OPTIONS: { value: number; label: string }[] = [
  { value: 25, label: "within 25 km" },
  { value: 50, label: "within 50 km" },
  { value: 100, label: "within 100 km" },
];

export const MAX_RADIUS_KM = 100;

/* -------------------------------------------------------------------------- */
/* Pace                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The pace a route asks for.
 *
 * Komoot prints min/km, which is the right metric for a bike path and the wrong
 * one for a mountain: nobody paces the Goûter in minutes per kilometre, because
 * the kilometres are not the problem. The metric alpinists actually plan with is
 * VERTICAL RATE — metres of ascent per hour — so that is what this returns.
 *
 * Derived from the route's own stated time and ascent. Where the stated time is
 * a span of days there is no hourly figure to derive, and it says so rather than
 * inventing a summit day.
 */
export function paceFor(route: Route): { value: string; unit: string; note: string } {
  const hours = hoursFrom(route.durationLabel);
  if (hours) {
    return {
      value: String(Math.round(route.elevationGainM / hours / 10) * 10),
      unit: "m/h ascent",
      note: `The rate the ${route.durationLabel} time implies.`,
    };
  }

  const days = daysFrom(route.durationLabel);
  if (days) {
    return {
      value: `${Math.round(route.elevationGainM / days / 10) * 10}`,
      unit: "m/day ascent",
      note: `Averaged across ${route.durationLabel} — real ascent days are not evenly spaced.`,
    };
  }

  return { value: "—", unit: "pace", note: "No stated time to derive a rate from." };
}

/** "1 long day" → 12; "6–8 hrs" → 7. Days are handled separately. */
function hoursFrom(label: string): number | null {
  const hrs = /(\d+)\s*(?:–|-|to)?\s*(\d+)?\s*(?:h|hr|hrs|hours)/i.exec(label);
  if (hrs) {
    const a = Number(hrs[1]);
    const b = hrs[2] ? Number(hrs[2]) : a;
    return (a + b) / 2;
  }
  // "1 long day" is the one prose duration in the catalogue, and it means a
  // pre-dawn start and a late finish — not 24 hours, and not 8.
  if (/^1\s+long\s+day$/i.test(label.trim())) return 12;
  return null;
}

function daysFrom(label: string): number | null {
  const d = /(\d+)\s*(?:–|-|to)?\s*(\d+)?\s*days?/i.exec(label);
  if (!d) return null;
  const a = Number(d[1]);
  const b = d[2] ? Number(d[2]) : a;
  return (a + b) / 2;
}
