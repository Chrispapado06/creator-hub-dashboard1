import { sync } from "@/services/repository";
import { DEMAND_ID, DEMAND_LEVEL_LABEL, type DemandLevel } from "@/services/demandProfile";
import type { Difficulty, Mountain, MountainRoute } from "@/types";

/**
 * Routes, as a first-class thing.
 *
 * The route data already existed — every curated mountain carries real, named,
 * documented lines (Goûter PD, Trois Monts AD, the Hörnli ridge) with a grade,
 * a distance and a vertical gain — but almost nothing read them. This module
 * lifts them out of the mountain record so they can be listed, filtered, opened
 * and, most importantly, connected to what the athlete is training for.
 *
 * ── WHAT IS AND IS NOT DERIVED ─────────────────────────────────────────────
 *
 * Distance, vertical, grade, duration and description are FACTS carried by the
 * route record. The demand profile below is DERIVED from those facts and is
 * labelled as such.
 *
 * Nothing here invents popularity, star ratings, completion counts, community
 * photos or "safe" verdicts. Those need real users and a backend; a fabricated
 * "1,204 people did this route" is the same class of lie as a fabricated
 * climbing partner, and on a mountain it carries more weight because people read
 * popularity as safety.
 */

export type RouteKind = "summit" | "approach" | "training" | "acclimatisation" | "traverse";

export interface Route extends MountainRoute {
  /** Stable id: mountain + slugified route name. */
  id: string;
  mountainId: string;
  mountainName: string;
  /** Summit elevation of the mountain the route belongs to. */
  mountainElevationM: number;
  /** Summit position — what makes a route findable from where you are. */
  mountainLat: number;
  mountainLon: number;
  country: string;
  range: string;
  photo: string;
  kind: RouteKind;
  /** True when the route record itself describes a multi-day outing. */
  multiDay: boolean;
}

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * A route's kind, read off what the record already says rather than guessed.
 * Anything that does not clearly signal otherwise is a summit line, because
 * that is what a named route on a mountain page is.
 */
function kindOf(route: MountainRoute): RouteKind {
  const t = `${route.name} ${route.description}`.toLowerCase();
  if (/traverse|ridge traverse|integrale/.test(t)) return "traverse";
  if (/approach|walk-in|trailhead|hut walk/.test(t)) return "approach";
  if (/acclimatis|acclimatiz|rotation/.test(t)) return "acclimatisation";
  if (/training|preparation/.test(t)) return "training";
  return "summit";
}

const isMultiDay = (r: MountainRoute) => /day/i.test(r.durationLabel) && !/^1 day$/i.test(r.durationLabel.trim());

function toRoute(m: Mountain, r: MountainRoute): Route {
  return {
    ...r,
    id: `${m.id}--${slug(r.name)}`,
    mountainId: m.id,
    mountainName: m.name,
    mountainElevationM: m.elevationM,
    mountainLat: m.coords.lat,
    mountainLon: m.coords.lon,
    country: m.country,
    range: m.range,
    photo: m.photo,
    kind: kindOf(r),
    multiDay: isMultiDay(r),
  };
}

/** Every route ICEFALL holds, flattened out of the mountain records. */
export function allRoutes(): Route[] {
  return sync.mountains.flatMap((m) => (m.routes ?? []).map((r) => toRoute(m, r)));
}

export function routesForMountain(mountainId: string): Route[] {
  const m = sync.mountainById(mountainId);
  return m ? (m.routes ?? []).map((r) => toRoute(m, r)) : [];
}

export function routeById(id: string): Route | undefined {
  return allRoutes().find((r) => r.id === id);
}

/* -------------------------------------------------------------------------- */
/* Demands — derived from the route's own numbers                             */
/* -------------------------------------------------------------------------- */

export interface RouteDemand {
  id: string;
  label: string;
  level: DemandLevel;
  /** Why the route asks for it, in terms of the route's own figures. */
  note: string;
}

const level = (v: number, high: number, veryHigh: number): DemandLevel =>
  v >= veryHigh ? "very-high" : v >= high ? "high" : "moderate";

/**
 * What this route asks of a body.
 *
 * Derived from the ROUTE, not the mountain: two lines on the same summit can
 * demand very different things, and averaging them to the peak's elevation is
 * exactly the imprecision this app exists to avoid. Altitude is the one demand
 * that legitimately comes from the summit height.
 */
export function routeDemands(route: Route): RouteDemand[] {
  const gain = route.elevationGainM;
  const km = route.distanceKm;
  const out: RouteDemand[] = [
    {
      id: DEMAND_ID.verticalEndurance,
      label: "Vertical endurance",
      level: level(gain, 900, 1600),
      note: `${gain.toLocaleString("en-GB")} m of ascent in a single line.`,
    },
    {
      id: DEMAND_ID.aerobicEndurance,
      label: "Aerobic endurance",
      level: level(km, 12, 20),
      note: `${km} km on mountain ground, ${route.durationLabel.toLowerCase()}.`,
    },
    {
      id: DEMAND_ID.technicalSkill,
      label: "Technical skill",
      level: level(route.difficulty, 3, 5),
      note: `Graded ${route.gradeLabel}. Technical ground is a skill question, not a fitness one.`,
    },
    {
      id: DEMAND_ID.packEndurance,
      label: "Pack endurance",
      level: route.multiDay ? "very-high" : level(gain, 1000, 1800),
      note: route.multiDay
        ? "A multi-day outing — everything you need is carried."
        : "Carried weight over the full ascent.",
    },
  ];

  // Altitude only when the summit is genuinely high enough to matter.
  if (route.mountainElevationM >= 3000) {
    out.push({
      id: DEMAND_ID.altitude,
      label: "Altitude",
      level: level(route.mountainElevationM, 4000, 6000),
      note: `Tops out at ${route.mountainElevationM.toLocaleString("en-GB")} m. Acclimatisation is earned, never trained around.`,
    });
  }
  return out;
}

export const ROUTE_DEMAND_DISCLAIMER =
  "Demands are derived from this route's distance, ascent and grade — they describe what the line asks for, not whether you are ready for it, and never that it is safe on the day.";

/* -------------------------------------------------------------------------- */
/* Filtering                                                                  */
/* -------------------------------------------------------------------------- */

export interface RouteFilters {
  kind?: RouteKind | "all";
  maxDistanceKm?: number;
  minGainM?: number;
  maxDifficulty?: Difficulty;
  mountainId?: string;
  query?: string;
}

export function filterRoutes(routes: Route[], f: RouteFilters): Route[] {
  const q = f.query?.trim().toLowerCase();
  return routes.filter((r) => {
    if (f.kind && f.kind !== "all" && r.kind !== f.kind) return false;
    if (f.mountainId && r.mountainId !== f.mountainId) return false;
    if (f.maxDistanceKm !== undefined && r.distanceKm > f.maxDistanceKm) return false;
    if (f.minGainM !== undefined && r.elevationGainM < f.minGainM) return false;
    if (f.maxDifficulty !== undefined && r.difficulty > f.maxDifficulty) return false;
    if (q && !`${r.name} ${r.mountainName} ${r.range} ${r.country} ${r.description}`.toLowerCase().includes(q))
      return false;
    return true;
  });
}

export const KIND_LABEL: Record<RouteKind, string> = {
  summit: "Summit",
  approach: "Approach",
  training: "Training",
  acclimatisation: "Acclimatisation",
  traverse: "Traverse",
};

export { DEMAND_LEVEL_LABEL };

/* -------------------------------------------------------------------------- */
/* Photography                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The bundled photographs ICEFALL holds of each curated mountain.
 *
 * Every entry is a file verified to exist in `public/img` — there was a
 * `_gallery.json` manifest here listing twenty files that had never been
 * downloaded, which is how a card ends up rendering a broken image. A list of
 * photographs is only useful if it is a list of photographs that exist.
 */
const BUNDLED_PHOTOS: Record<string, string[]> = {
  "mont-blanc": ["/img/mont-blanc.jpg", "/img/mont-blanc-2.jpg", "/img/mont-blanc-3.jpg"],
  matterhorn: ["/img/matterhorn.jpg"],
  everest: ["/img/everest.jpg", "/img/everest-1.jpg", "/img/everest-3.jpg"],
  "mount-olympus": ["/img/mount-olympus.jpg", "/img/mount-olympus-1.jpg", "/img/mount-olympus-2.jpg"],
  "gran-paradiso": ["/img/gran-paradiso.jpg", "/img/gran-paradiso-2.jpg"],
  eiger: ["/img/eiger.jpg"],
  triglav: ["/img/triglav.jpg"],
  toubkal: ["/img/toubkal.jpg", "/img/toubkal-1.jpg", "/img/toubkal-2.jpg"],
  denali: ["/img/denali.jpg", "/img/denali-1.jpg"],
  aconcagua: ["/img/aconcagua.jpg"],
};

/**
 * A photograph for THIS route's card.
 *
 * Two routes on the same mountain are two different days out, and showing the
 * identical frame for both makes the list read as one repeated result. Where
 * ICEFALL holds more than one photograph of the mountain, each route takes a
 * different one — deterministically, so a card doesn't change picture as you
 * scroll. It is always a photograph of the right mountain; only the frame
 * differs.
 */
export function routePhoto(route: Route): string {
  const shots = BUNDLED_PHOTOS[route.mountainId];
  if (!shots?.length) return route.photo;
  const siblings = routesForMountain(route.mountainId);
  const i = Math.max(0, siblings.findIndex((r) => r.id === route.id));
  return shots[i % shots.length];
}
