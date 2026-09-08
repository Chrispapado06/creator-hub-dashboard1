/**
 * The two things the trail page shows that are neither stored in OpenStreetMap
 * nor already computed by a service: the route's SHAPE and its ACCESS RULES.
 *
 * Both are derived here rather than in `services/`, because both are presentation
 * decisions about how to phrase measured data — not new data. Nothing in this
 * file invents a value: every answer either comes back with its own evidence
 * attached, or comes back `null` so the screen can leave the space empty.
 */

import { haversine } from "@/tracking/filters";
import type { LatLon } from "@/services/trails";
import type { TrailWay } from "@/services/trailProfile";

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

export interface RouteShape {
  /** "Loop" or "Point to point" — the figure. */
  word: string;
  /** Where the figure came from — the small line printed under it. */
  detail: string;
}

/**
 * How close the two ends have to be before a route counts as a loop.
 *
 * A relation's ends are the ends of the MAPPED line, not of the walk: a loop
 * mapped from a car park often starts and finishes a few dozen metres apart
 * because the two ways meet at different nodes on the same lane. 250 m is wide
 * enough to absorb that and far too narrow to swallow a real out-and-back.
 */
const ENDS_MEET_M = 250;

/** Below this, the two ends of anything are close together and it proves nothing. */
const MIN_LOOP_LENGTH_KM = 1;

/**
 * Loop or point to point — MEASURED, never guessed.
 *
 * OSM's own `roundtrip` tag outranks the measurement wherever a mapper set it:
 * they walked it and we did not. Without the tag the answer comes from the
 * geometry, and `trailGeometry` is what makes that legitimate — it reads the
 * relation's members in membership order and skips alternative and excursion
 * roles, so `line[0]` and the last point are the route's own two ends rather
 * than whichever way happened to sort first by id. What it does NOT do is turn
 * a member way that was drawn backwards the right way round — which is why the
 * ways get a vote of their own below.
 *
 * Returns null rather than a shrug: a route with no line, no closed circuit and
 * no tag has no honest answer, and the stats row prints "—" for it.
 */
export function routeShape(
  line: LatLon[],
  ways: TrailWay[] | null,
  roundtrip: boolean | undefined,
  lengthKm: number | null,
): RouteShape | null {
  if (roundtrip === true) return { word: "Loop", detail: "as mapped" };
  if (roundtrip === false) return { word: "Point to point", detail: "as mapped" };

  /*
   * THE SECOND MEASUREMENT, AND WHY THERE HAS TO BE ONE.
   *
   * `trailGeometry` concatenates the member ways in MEMBERSHIP order but does
   * not reverse the ones whose own geometry runs the other way — and OSM
   * routinely reuses an existing way in whichever direction it was drawn. When
   * the last member is stored backwards, the last point of the joined line is
   * that way's far end rather than the route's, so a real loop can measure as
   * kilometres of gap. The word would then be wrong even though the number
   * under it was honestly measured, which is the worse failure of the two.
   *
   * `looseEnds` does not care which way a way was drawn: it counts how many
   * junctions the ways leave with an odd number of ends. Zero means the ways
   * form a closed circuit, whichever order you walk them in.
   */
  const loose = ways ? looseEnds(ways) : null;
  /*
   * The circuit answers first, and it answers at any length. The minimum
   * length below guards the GAP test — two ends of a 300 m spur are always
   * close together — and has nothing to say about ways that demonstrably join
   * back up.
   */
  if (loose === 0) return { word: "Loop", detail: "ways close a circuit" };

  if (line.length < 2) return null;
  if (lengthKm == null || lengthKm < MIN_LOOP_LENGTH_KM) return null;

  const gapM = haversine(line[0], line[line.length - 1]);
  if (gapM <= ENDS_MEET_M) return { word: "Loop", detail: "ends meet" };
  return { word: "Point to point", detail: `ends ${fmtGap(gapM)} apart` };
}

/**
 * How many ends the member ways leave loose — 0 for a closed circuit, 2 for a
 * route with a start and a finish, more where the relation also carries spurs
 * or alternatives (`way(r)` returns those too, with no role to filter them by).
 *
 * Coordinates are compared at five decimal places, about a metre. Ways that
 * meet share an OSM node, so Overpass returns the identical figure for both
 * and they round identically; a metre is far too tight to join two ways that
 * only nearly touch.
 *
 * Null where there is nothing to count, so the caller can tell "no evidence"
 * from "evidence of two ends".
 */
function looseEnds(ways: TrailWay[]): number | null {
  const ends = new Map<string, number>();
  for (const w of ways) {
    if (w.geometry.length < 2) continue;
    for (const p of [w.geometry[0], w.geometry[w.geometry.length - 1]]) {
      const key = `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
      ends.set(key, (ends.get(key) ?? 0) + 1);
    }
  }
  if (ends.size === 0) return null;
  let loose = 0;
  for (const n of ends.values()) if (n % 2 === 1) loose += 1;
  return loose;
}

function fmtGap(m: number): string {
  return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

/* -------------------------------------------------------------------------- */
/* Access                                                                      */
/* -------------------------------------------------------------------------- */

export interface AccessChip {
  key: string;
  /** What the tag says, in words. */
  label: string;
  /** How much of the measured route says it. */
  detail: string;
}

/**
 * Access rules, read off the member ways AS A SHARE OF THE MEASURED LENGTH.
 *
 * The reference this screen was built from carries a row of chips — Dog-friendly,
 * Child-friendly, Bike touring, Trail running — which are a competitor's own
 * editorial categories. Only four of them correspond to anything OSM records
 * (`dog`, `bicycle`, `horse`, `foot`), and the rest are not derivable from a
 * way's tags at all, so they are not printed.
 *
 * The share matters as much as the value. A route whose last two kilometres are
 * `dog=no` is not "dog-friendly", and a blanket chip over it is exactly the one
 * that gets somebody turned back at a gate. So every chip carries the metres
 * that back it, and a route tagged both ways gets BOTH chips rather than a
 * majority verdict.
 *
 * The relation's own access tags never reach here — `toTrails()` does not keep
 * them — so the ways are the only source, which is the stricter one anyway:
 * they are the ground you actually walk on.
 */
export function accessChips(ways: TrailWay[]): AccessChip[] {
  const total = ways.reduce((m, w) => m + w.lengthM, 0);
  if (total === 0) return [];

  const chips: AccessChip[] = [];
  for (const rule of RULES) {
    // metres per distinct tag value, so "yes for 8 km, no for 3 km" survives.
    const metres = new Map<string, number>();
    for (const w of ways) {
      const value = w.tags[rule.tag];
      if (!value) continue;
      const phrase = rule.phrase(value);
      if (!phrase) continue;
      metres.set(phrase, (metres.get(phrase) ?? 0) + w.lengthM);
    }
    for (const [label, m] of [...metres.entries()].sort((a, b) => b[1] - a[1])) {
      chips.push({ key: `${rule.tag}:${label}`, label, detail: shareDetail(m, total) });
    }
  }
  return chips;
}

/**
 * Only the values that mean something different on the ground.
 *
 * `permissive` and `designated` both mean you may go, so they are not given
 * their own wording — the distinction is a legal one that changes nothing about
 * the walk. `private`, `no` and `discouraged` all mean turn back, and are worth
 * saying plainly.
 */
const ALLOWED = new Set(["yes", "permissive", "designated", "official"]);
const REFUSED = new Set(["no", "private", "discouraged"]);

const RULES: { tag: string; phrase: (value: string) => string | null }[] = [
  {
    tag: "dog",
    phrase: (v) =>
      v === "leashed"
        ? "Dogs on a lead"
        : ALLOWED.has(v)
          ? "Dogs allowed"
          : REFUSED.has(v)
            ? "No dogs"
            : null,
  },
  {
    tag: "bicycle",
    phrase: (v) => (ALLOWED.has(v) ? "Cyclists allowed" : REFUSED.has(v) ? "No cycling" : null),
  },
  {
    tag: "horse",
    phrase: (v) => (ALLOWED.has(v) ? "Horses allowed" : REFUSED.has(v) ? "No horses" : null),
  },
  {
    /*
     * Only the RESTRICTIVE side of `foot`. That a hiking route is walkable is
     * not news and a chip saying so is noise; that part of one is closed to
     * walkers is the single most useful thing on the row.
     */
    tag: "foot",
    phrase: (v) => (REFUSED.has(v) ? "Closed to walkers" : null),
  },
];

/** "tagged on 8.4 of 11.2 km", or nothing to qualify when it covers the lot. */
function shareDetail(metres: number, total: number): string {
  if (metres / total >= 0.98) return "tagged along the route";
  return `tagged on ${(metres / 1000).toFixed(1)} of ${(total / 1000).toFixed(1)} km`;
}
