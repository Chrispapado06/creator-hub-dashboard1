/**
 * The pure half of the Map tab (plan §3.3, §4.6): wording, coordinates, and
 * straight-line distance and bearing to the places ICEFALL has real positions
 * for. No React, no network, no clock of its own.
 */

import { haversine } from "@/tracking/filters";

import { ageLabel } from "./format";
// Not `tracking/follow`: it imports `services/trails`, which makes network requests.
import { compassPoint, trueBearing as bearing } from "./nowModel";
import { positionFreshness, type KnownPosition } from "./position";

/** Printed under every route line that is ever drawn. None is drawn today. */
export const ROUTE_LINE_LABEL = "Illustrative — not for navigation";

/** Plan §3.3 / §4.6, word for word. */
export const MAP_NOT_SAVED =
  "ICEFALL shows the part of the map you have already looked at. It has not saved this area.";

export const NO_ROUTE_LINE = "No route line. ICEFALL holds no geometry for this route, so it draws none.";

export const STRAIGHT_LINE = "Straight-line, not along a path.";

/** Plan §3.3: there is no compass needle, so the bearing says what it is. */
export const NOT_A_HEADING =
  "Your phone's compass is not available — this is a bearing from the map, not a heading. True north.";

export const FINDING_SATELLITES =
  "Finding satellites. This can take a long time with no signal, and it can fail under a face or in a valley.";

export interface Place {
  name: string;
  lat: number;
  lon: number;
  elevationM: number | null;
  /** "Summit", "Mountain hut", … */
  kind: string;
}

export interface PlaceReading {
  place: Place;
  distanceM: number;
  bearingDeg: number;
  point: string;
  /** Closer than the fix's own accuracy: the bearing is noise, so it is not shown. */
  withinAccuracy: boolean;
}

export type PlaceReadings =
  | { kind: "none" }
  | { kind: "withheld"; sentence: string }
  | { kind: "readings"; readings: PlaceReading[] };

/**
 * Distance and bearing come from the CURRENT fix, never an old one (plan §3.3,
 * CORRECTED rule 3). Past five minutes the position is "stale" and the
 * direction is withheld outright rather than shown greyed: a greyed arrow is
 * still an arrow somebody walks along.
 */
export function placeReadings(places: Place[], fix: KnownPosition | null, now: number): PlaceReadings {
  if (!fix) return { kind: "none" };
  const freshness = positionFreshness(fix, now);
  if (freshness === "stale" || freshness === "silent") {
    return {
      kind: "withheld",
      sentence: `Your last position is ${ageLabel(now - fix.at).replace(/ ago$/, "")} old. ICEFALL cannot tell you which way these are from where you are standing.`,
    };
  }
  const here = { lat: fix.lat, lon: fix.lon };
  return {
    kind: "readings",
    readings: places.map((place) => {
      const deg = bearing(here, place);
      const distanceM = haversine(here, place);
      return {
        place,
        distanceM,
        withinAccuracy: fix.accuracyM !== null && distanceM <= fix.accuracyM,
        bearingDeg: Math.round(deg) % 360,
        point: compassPoint(deg),
      };
    }),
  };
}

/** "640 m", "2.4 km", "38 km". */
export function distanceLabel(m: number): string {
  if (m < 1000) return `${Math.max(0, Math.round(m / 10) * 10)} m`;
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/**
 * Plan §3.0: camps and huts are fresh for 12 months, then greyed and
 * labelled, and never silent — a hut's position ageing is information.
 */
export function campsAreOld(harvestISO: string, today: string): boolean {
  const [y, m, d] = harvestISO.split("-").map(Number);
  const limit = `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return today > limit;
}
