/**
 * The privacy mechanisms of the Expedition Network.
 *
 * These two functions are not decoration and they are not "good enough for a
 * prototype". They are the actual defence, and the threat they defend against
 * is specific: this feature exists to put strangers in touch about meeting in
 * remote places, so a location signal that can be resolved to a home, a regular
 * start point or a daily routine is the most dangerous thing the app could
 * publish about anybody.
 *
 * Two independent defects have to be closed, because closing one alone leaves
 * the position recoverable:
 *
 *   1. PRECISION. A stored coordinate is quantised to a ~5 km grid before it is
 *      written, so the finest thing that exists anywhere in the app — memory,
 *      localStorage, a future export — is a grid cell, not a person.
 *   2. DIFFERENCING. Even coarse positions leak if the DISTANCE between two
 *      people is published as a continuous number: an observer who moves, or
 *      who reads the figure over several days, can trilaterate a cell down to
 *      the point it stops protecting anyone. So distance is only ever shown as
 *      one of a handful of wide bands, and a band that does not change as the
 *      observer moves carries almost no information about where the other
 *      person is.
 *
 * Neither exact coordinates, addresses, phone numbers nor email addresses are
 * ever exposed by this feature. There is no code path that renders one.
 */

/* -------------------------------------------------------------------------- */
/* Notices                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Shown wherever location is asked for or a distance is displayed.
 *
 * It describes what the code above actually does. If the mechanism changes,
 * this sentence changes with it — a privacy claim the implementation no longer
 * supports is worse than no claim at all.
 */
export const LOCATION_NOTICE =
  "ICEFALL never shows your exact location. Your position is rounded to roughly a 5 km grid before it is saved, and other people only ever see a wide distance band — never a coordinate, an address or a precise figure. Location is off until you turn it on, and turning it off deletes what was stored.";

/**
 * Shown before anyone arranges to meet anyone.
 *
 * Note what it does NOT say: it never suggests that a high match score, a
 * complete profile or anything else in ICEFALL is a reason to trust a person.
 * ICEFALL checks nobody, and the reminder says so first because everything
 * after it depends on the reader understanding that.
 */
export const SAFETY_REMINDER =
  "ICEFALL does not check anyone's identity, experience, qualifications or safety, and nothing in this app is a recommendation of a person. Meet publicly the first time, in town rather than at a trailhead. Ask directly about what someone has actually climbed and who they climbed it with, and go out together on something well within both your limits before you commit to anything serious. Tell someone who is not on the trip where you are going and when you expect to be back. Agree turnaround times before you set off, and be ready to walk away from a route or from a partnership at any point. For anything glaciated or technical, climb with an IFMGA/UIAGM-certified guide.";

/* -------------------------------------------------------------------------- */
/* Coarsening                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Grid size, in kilometres.
 *
 * 5 km is chosen as the largest cell that still supports the only question this
 * feature asks of location — "is this person near enough to train with" — while
 * being far larger than a town, a valley road or a trailhead. Anything finer
 * starts to describe where someone lives.
 */
export const COARSEN_GRID_KM = 5;

const KM_PER_DEGREE_LAT = 111.32;

/**
 * Beyond ~85° the longitude grid degenerates (cells shrink towards the pole and
 * the 1/cos term runs away), so the scale factor is clamped. At those latitudes
 * a longitude cell is meaningless anyway and there is nobody to protect from it.
 */
const MIN_COS_LAT = Math.cos((85 * Math.PI) / 180);

const RAD = Math.PI / 180;

/** Enough decimals to land back on the same grid cell, not enough to add detail. */
const OUTPUT_DECIMALS = 5;

const roundTo = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Longitudes wrap; a snapped value can cross the antimeridian. */
const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/**
 * Snaps a position to a ~5 km grid.
 *
 * Snapping, not jittering. A random offset looks private and is not: repeated
 * readings of a jittered position average back to the truth, and the more often
 * someone opens the app the better the estimate gets. A grid cell does not
 * average away — every reading from inside the cell returns the identical
 * value, which is exactly the property we want.
 *
 * The longitude step is computed from the ALREADY-SNAPPED latitude, not the raw
 * one. That matters: if the step depended on the input latitude, two positions
 * in the same cell would use very slightly different steps and could snap to
 * different longitudes, and the difference between them would be a signal about
 * the input we just spent this function destroying.
 *
 * A non-finite input is returned unchanged rather than defaulted. Substituting
 * 0, 0 would place the athlete in the Gulf of Guinea — a real coordinate, and
 * a fabricated position is precisely what this file exists to prevent.
 */
export function coarsen(lat: number, lon: number): { lat: number; lon: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { lat, lon };

  const latStep = COARSEN_GRID_KM / KM_PER_DEGREE_LAT;
  const snappedLat = Math.min(90, Math.max(-90, Math.round(lat / latStep) * latStep));

  const cos = Math.max(MIN_COS_LAT, Math.abs(Math.cos(snappedLat * RAD)));
  const lonStep = COARSEN_GRID_KM / (KM_PER_DEGREE_LAT * cos);
  const snappedLon = wrapLon(Math.round(lon / lonStep) * lonStep);

  return {
    lat: roundTo(snappedLat, OUTPUT_DECIMALS),
    lon: roundTo(snappedLon, OUTPUT_DECIMALS),
  };
}

/* -------------------------------------------------------------------------- */
/* Distance                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Distance bands, in kilometres.
 *
 * Wide and few on purpose. A continuous "23.4 km" from three positions is a
 * trilateration; a band that only changes at 10, 25, 50, 100, 250, 500 and
 * 1,000 km almost never changes at all as the reader moves, and when it does it
 * has told them they crossed one ring. Below the first band the figure is
 * suppressed entirely rather than sharpened, because at that range the
 * coarsening grid is already the dominant term and a number would be noise
 * dressed as precision.
 */
const DISTANCE_BANDS: { upToKm: number; label: string }[] = [
  { upToKm: 10, label: "Within 10 km" },
  { upToKm: 25, label: "~25 km away" },
  { upToKm: 50, label: "~50 km away" },
  { upToKm: 100, label: "~100 km away" },
  { upToKm: 250, label: "~250 km away" },
  { upToKm: 500, label: "~500 km away" },
  { upToKm: 1000, label: "~1,000 km away" },
];

const BEYOND_BANDS_LABEL = "Over 1,000 km away";

/**
 * The only distance string this feature may display.
 *
 * Never format a distance any other way, and never show the underlying number
 * alongside it — one precise figure anywhere in the UI undoes the banding
 * everywhere else.
 *
 * An unusable input returns the honest absence rather than a zero: "Within
 * 10 km" for a distance we do not have would put a stranger on the doorstep.
 */
export function approxDistanceLabel(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "Distance not available";
  const band = DISTANCE_BANDS.find((b) => km <= b.upToKm);
  return band ? band.label : BEYOND_BANDS_LABEL;
}
