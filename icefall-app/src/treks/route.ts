import { TREK_ROUTES } from "./osmRoutes";

/**
 * THE LINE A TREK IS WALKED ON, WHERE ONE IS KNOWN.
 *
 * A `Trek` record is descriptive: a name, a country, a duration, a grade, a
 * high point, a paragraph. It carries no coordinates and no geometry, which is
 * why the trek page had no map, no GPX and no elevation profile while the trail
 * page had all three — a `Trail` IS an OpenStreetMap `relation[route=hiking]`
 * and comes with a real mapped line.
 *
 * Most of the great treks are that same object in OSM. `scripts/match-treks-to-
 * osm.mjs` matched the catalogue against those relations and wrote
 * `osmRoutes.ts`. A trek that appears there gets an `osmId`, and from that id
 * everything the trail page can do follows through exactly the same services —
 * `trailGeometry` for the line, `trailWays` and `elevationOf` for the profile,
 * `toGpx` for the file. There is no second geometry pipeline and no geometry
 * stored in this app.
 *
 * ── WHAT THIS TYPE IS CAREFUL ABOUT ─────────────────────────────────────────
 * `evidence` is not decoration and is not a debug field: it is the reason this
 * trek is pointed at this relation, and the page prints it. A walker following
 * a line has a right to know that the line is OSM's, which relation it is, and
 * what was actually checked before the two were joined — because a trek pointed
 * at the wrong relation sends somebody up a different mountain.
 *
 * `confidence` is "strong" where the relation calls itself what the trek calls
 * it, and "medium" where the names agree but nothing independent corroborated
 * it. Nothing weaker than that is in the file at all: the script declines
 * rather than guesses, and a trek with no entry here keeps the behaviour it has
 * always had — no map, and nothing empty drawn where one would be.
 *
 * Route data © OpenStreetMap contributors, ODbL.
 */
export interface TrekRoute {
  /** OSM relation id. The same id `services/trails.ts` takes everywhere. */
  osmId: number;
  /**
   * The relation's OWN name, which is frequently not the trek's — "Tour du Mont
   * Blanc - Itinéraire principal", "Tour du Cervin" for the Tour du Matterhorn.
   * Shown as provenance, never as the trek's title.
   */
  osmName: string;
  /** Kilometres, measured by Overpass off the relation's geometry. */
  lengthKm: number | null;
  /** Centre of the relation's bounding box — a frame for the map, not a place. */
  lat: number;
  lon: number;
  /** [south, west, north, east] of the relation. */
  bounds: [number, number, number, number];
  confidence: "strong" | "medium";
  /** What was tested, in the words the page shows. */
  evidence: string[];
}

/** The mapped line for a trek, or nothing — and nothing is a normal answer. */
export const trekRoute = (trekId: string): TrekRoute | undefined => TREK_ROUTES[trekId];
